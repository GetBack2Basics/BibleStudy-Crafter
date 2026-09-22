"""Text-to-speech for a study day's content, via gTTS (Google Translate TTS).

Flow:
* GET  /api/tts/voices            -> list of available voices (cached in-process)
* POST /api/tts/render            -> kick off a TTS render for a day; returns {asset_id, status}
* GET  /api/tts/asset/{asset_id}  -> stream the rendered MP3 (or 202 while rendering)

Rendering is best-effort and asynchronous: a background task writes the MP3 bytes
into the asset row (same pattern as the image assets), and the client polls the
asset endpoint until status=ready.

Provider: gTTS only.  edge-tts was removed because Microsoft permanently blocked
its hardcoded TrustedClientToken (6A5AA1D4EAFF4E9FB37E23D68491D6F4) — every
version of edge-tts ships the same token, so upgrading never helps.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_engine, get_session
from app.models import Asset, Study, StudyDay, User
from app.services import events

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tts", tags=["tts"])

# In-process voice cache — populated once per worker process.
_voices: list[dict[str, str]] | None = None


def _gtts_langs() -> list[dict[str, str]]:
    """gTTS supported languages as voice entries, with a locale derived from the lang code."""
    import gtts.lang
    try:
        langs = gtts.lang.tts_langs()
    except Exception:  # noqa: BLE001
        logger.exception("gtts.lang.tts_langs failed")
        return []
    frames: list[dict[str, str]] = []
    for code, name in sorted(langs.items()):
        parts = code.split("_")
        locale = parts[0].lower()
        if len(parts) > 1:
            locale = f"{parts[0]}-{parts[1].upper()}"
        frames.append({
            "short_name": f"gtts-{code}",
            "gender": "",
            "friendly_name": f"Google {name} ({code})",
            "locale": locale,
        })
    return frames


def get_voices() -> list[dict[str, str]]:
    global _voices
    if _voices is None:
        gtts = _gtts_langs() or []
        _voices = [{"category": "gtts", **v} for v in gtts]
    return _voices


def _passage_text_for_day(target_day: StudyDay) -> str:
    """Concatenate a day's readable content into a single TTS script."""
    blocks = target_day.blocks_json or {}
    parts: list[str] = []

    def add(label: str, text: str | None) -> None:
        if not text:
            return
        parts.append(f"{label}. {text}")

    add("Opening prayer", blocks.get("opening_prayer"))
    add("Commentary", blocks.get("commentary"))
    for q in blocks.get("questions") or []:
        add("Question", q)
    add("Closing prayer", blocks.get("closing_prayer"))

    if not parts:
        return ""
    return "\n\n".join(parts)


def _gtts_lang_for_voice(voice: str) -> str:
    """Map a gtts-\"lang\" voice code to a gTTS lang code."""
    if voice.startswith("gtts-"):
        return voice.split("-", 1)[1] or "en"
    return "en"


async def _render_with_gtts(asset: Asset, script: str, voice: str) -> bool:
    """Render with gTTS.  Returns True on success."""
    try:
        from gtts import gTTS
    except Exception:  # noqa: BLE001
        asset.error = "gTTS unavailable in this environment"
        asset.media_type = ""
        asset.content = b""
        return False

    lang = _gtts_lang_for_voice(voice)
    tmp = Path(f"/tmp/tts-{asset.id}-gtts.mp3")
    try:
        tts = gTTS(script, lang=lang)
        tts.save(str(tmp))
        asset.provider = "gtts"
        asset.model = f"gtts-{lang}"
        asset.media_type = "audio/mpeg"
        asset.content = tmp.read_bytes()
        asset.status = "ready"
        asset.error = ""
        return True
    except Exception as exc:  # noqa: BLE001
        logger.exception("gTTS render failed for asset %s", asset.id)
        asset.error = f"{type(exc).__name__}: {exc}"
        asset.media_type = ""
        asset.content = b""
        return False
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass


async def _render_asset(asset: Asset, script: str, voice: str) -> None:
    """Render the script to MP3 and store the bytes on the asset row."""
    if await _render_with_gtts(asset, script, voice):
        return

    asset.status = "failed"
    if not asset.error:
        asset.error = "gTTS render failed"
    asset.media_type = ""
    asset.content = b""
    logger.exception("TTS render failed for asset %s", asset.id)


@router.get("/voices")
def tts_voices(user: User = Depends(get_current_user)) -> dict[str, Any]:
    voices = get_voices()
    return {"voices": voices, "count": len(voices)}


class TTSRenderIn(BaseModel):
    study_id: int
    day_number: int
    voice: str  # gtts-"lang", e.g. "gtts-en" or "gtts-en_US"


class TTSAssetOut(BaseModel):
    asset_id: int
    status: str
    message: str = ""


@router.post("/render", status_code=202)
async def tts_render(
    body: TTSRenderIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TTSAssetOut:
    s = session.get(Study, body.study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    target = next((d for d in s.days if d.day_number == body.day_number), None)
    if target is None:
        raise HTTPException(400, "day out of range")

    script = _passage_text_for_day(target)
    if not script.strip():
        raise HTTPException(400, "day has no content to read")

    voices = get_voices()
    if voices and not any(v["short_name"] == body.voice for v in voices):
        raise HTTPException(400, f"unknown voice: {body.voice}")

    asset = Asset(
        study_day_id=target.id,
        kind="audio",
        provider="gtts",
        model=body.voice,
        prompt="",
        status="rendering",
        error="",
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)

    events.emit(
        "info", "tts",
        f"TTS render started for study {body.study_id} day {body.day_number} (asset {asset.id})",
        study_id=body.study_id,
    )

    # Fire-and-forget background render (same pattern as image assets).
    engine = session.get_bind()
    import asyncio
    asyncio.create_task(_render_and_commit(asset.id, script, body.voice, engine))
    return TTSAssetOut(asset_id=asset.id, status="rendering")


async def _render_and_commit(asset_id: int, script: str, voice: str, engine) -> None:
    from sqlmodel import Session as _Session

    render_exc: Exception | None = None
    try:
        with _Session(engine) as s:
            asset = s.get(Asset, asset_id)
            if asset is None:
                return
            await _render_asset(asset, script, voice)
            s.add(asset)
            s.commit()
            level = "success" if asset.status == "ready" else "warn"
            msg = f"TTS asset {asset_id} -> {asset.status}"
            if asset.error:
                msg += f": {asset.error}"
            events.emit(level, "tts", msg, study_id=None)
    except Exception as exc:  # noqa: BLE001
        logger.exception("TTS render-and-commit failed for asset %s", asset_id)
        render_exc = exc

    # Re-read the asset to report the final state, even if commit failed.
    try:
        with _Session(engine) as s:
            asset = s.get(Asset, asset_id)
            if asset is not None:
                level = "success" if asset.status == "ready" else "warn"
                msg = f"TTS asset {asset_id} -> {asset.status}"
                if asset.error:
                    msg += f": {asset.error}"
                if render_exc is not None and not asset.error:
                    msg += f" (commit/runtime error: {type(render_exc).__name__}: {render_exc})"
                events.emit(level, "tts", msg, study_id=None)
    except Exception:  # noqa: BLE001
        logger.exception("TTS event emit failed for asset %s", asset_id)


@router.get("/asset/{asset_id}")
def tts_asset(
    asset_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Any:
    from fastapi.responses import Response

    asset = session.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(404, "asset not found")

    # Ownership guard via the linked study day.
    if getattr(asset, "study_day_id", None) is not None:
        day = session.get(StudyDay, asset.study_day_id)
        if day is None:
            raise HTTPException(404, "asset not found")
        study = session.get(Study, day.study_id)
        if study is None or study.user_id != user.id:
            raise HTTPException(404, "asset not found")

    if asset.status == "rendering":
        raise HTTPException(202, "not yet ready")
    if asset.status == "failed":
        raise HTTPException(409, asset.error or "TTS render failed")
    if not asset.content:
        raise HTTPException(500, "asset has no content")

    return Response(
        content=asset.content,
        media_type=asset.media_type or "audio/mpeg",
        headers={"Content-Disposition": f"inline; filename=tts-{asset_id}.mp3"},
    )
