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
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user, get_current_user_optional
from app.db import get_engine, get_session
from app.models import Asset, DayPassage, Study, StudyDay, User
from app.services import events

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tts", tags=["tts"])

# In-process voice cache — populated once per worker process.
_voices: list[dict[str, str]] | None = None
_sample_cache: dict[str, bytes] = {}

VOICE_SPECS: dict[str, dict[str, str]] = {
    "gtts-en": {"lang": "en", "tld": "com", "friendly_name": "Google English (General)", "locale": "en", "gender": "Female", "accent": "Standard"},
    "gtts-en_US": {"lang": "en", "tld": "com", "friendly_name": "Google English (United States)", "locale": "en-US", "gender": "Female", "accent": "American"},
    "gtts-en_GB": {"lang": "en", "tld": "co.uk", "friendly_name": "Google English (United Kingdom)", "locale": "en-GB", "gender": "Female", "accent": "British"},
    "gtts-en_AU": {"lang": "en", "tld": "com.au", "friendly_name": "Google English (Australia)", "locale": "en-AU", "gender": "Female", "accent": "Australian"},
    "gtts-en_CA": {"lang": "en", "tld": "ca", "friendly_name": "Google English (Canada)", "locale": "en-CA", "gender": "Female", "accent": "Canadian"},
    "gtts-en_IN": {"lang": "en", "tld": "co.in", "friendly_name": "Google English (India)", "locale": "en-IN", "gender": "Female", "accent": "Indian"},
    "gtts-en_IE": {"lang": "en", "tld": "ie", "friendly_name": "Google English (Ireland)", "locale": "en-IE", "gender": "Female", "accent": "Irish"},
    "gtts-en_ZA": {"lang": "en", "tld": "co.za", "friendly_name": "Google English (South Africa)", "locale": "en-ZA", "gender": "Female", "accent": "South African"},
    "gtts-es": {"lang": "es", "tld": "es", "friendly_name": "Google Spanish (Spain)", "locale": "es-ES", "gender": "Female", "accent": "Castilian"},
    "gtts-es_MX": {"lang": "es", "tld": "com.mx", "friendly_name": "Google Spanish (Mexico)", "locale": "es-MX", "gender": "Female", "accent": "Mexican"},
    "gtts-fr": {"lang": "fr", "tld": "fr", "friendly_name": "Google French (France)", "locale": "fr-FR", "gender": "Female", "accent": "French"},
    "gtts-fr_CA": {"lang": "fr", "tld": "ca", "friendly_name": "Google French (Canada)", "locale": "fr-CA", "gender": "Female", "accent": "Canadian French"},
    "gtts-de": {"lang": "de", "tld": "de", "friendly_name": "Google German (Germany)", "locale": "de-DE", "gender": "Female", "accent": "German"},
    "gtts-it": {"lang": "it", "tld": "it", "friendly_name": "Google Italian (Italy)", "locale": "it-IT", "gender": "Female", "accent": "Italian"},
    "gtts-pt": {"lang": "pt", "tld": "pt", "friendly_name": "Google Portuguese (Portugal)", "locale": "pt-PT", "gender": "Female", "accent": "European Portuguese"},
    "gtts-pt_BR": {"lang": "pt", "tld": "com.br", "friendly_name": "Google Portuguese (Brazil)", "locale": "pt-BR", "gender": "Female", "accent": "Brazilian Portuguese"},
    "gtts-el": {"lang": "el", "tld": "gr", "friendly_name": "Google Greek (Biblical / Modern)", "locale": "el-GR", "gender": "Female", "accent": "Greek"},
    "gtts-la": {"lang": "la", "tld": "com", "friendly_name": "Google Latin (Traditional)", "locale": "la", "gender": "Female", "accent": "Latin"},
    "gtts-ja": {"lang": "ja", "tld": "co.jp", "friendly_name": "Google Japanese", "locale": "ja-JP", "gender": "Female", "accent": "Japanese"},
    "gtts-ko": {"lang": "ko", "tld": "co.kr", "friendly_name": "Google Korean", "locale": "ko-KR", "gender": "Female", "accent": "Korean"},
    "gtts-zh": {"lang": "zh-CN", "tld": "com", "friendly_name": "Google Chinese (Mandarin)", "locale": "zh-CN", "gender": "Female", "accent": "Mandarin"},
}


def _gtts_langs() -> list[dict[str, str]]:
    """gTTS supported languages as voice entries, starting with curated regional profiles."""
    frames: list[dict[str, str]] = []
    seen: set[str] = set()

    for code, spec in VOICE_SPECS.items():
        frames.append({
            "short_name": code,
            "gender": spec["gender"],
            "friendly_name": spec["friendly_name"],
            "locale": spec["locale"],
            "accent": spec.get("accent", ""),
        })
        seen.add(code)

    import gtts.lang
    try:
        langs = gtts.lang.tts_langs()
    except Exception:  # noqa: BLE001
        logger.exception("gtts.lang.tts_langs failed")
        return frames

    for code, name in sorted(langs.items()):
        short = f"gtts-{code}"
        if short in seen:
            continue
        parts = code.split("_")
        locale = parts[0].lower()
        if len(parts) > 1:
            locale = f"{parts[0]}-{parts[1].upper()}"
        frames.append({
            "short_name": short,
            "gender": "Female",
            "friendly_name": f"Google {name} ({code})",
            "locale": locale,
            "accent": name,
        })
        seen.add(short)

    return frames


def get_voices() -> list[dict[str, str]]:
    global _voices
    if _voices is None:
        gtts = _gtts_langs() or []
        _voices = [{"category": "gtts", **v} for v in gtts]
    return _voices


def _passage_text_for_day(
    target_day: StudyDay,
    section: str | None = None,
    session: Session | None = None,
    custom_text: str | None = None,
) -> str:
    """Concatenate readable content for a day or a specific section into a TTS script."""
    if custom_text and custom_text.strip():
        return custom_text.strip()

    blocks = target_day.blocks_json or {}
    sec = (section or "all").lower().strip()

    if sec == "opening_prayer":
        text = blocks.get("opening_prayer") or ""
        return f"Opening prayer. {text}" if text else ""

    if sec == "commentary":
        text = blocks.get("commentary") or ""
        return f"Theological commentary. {text}" if text else ""

    if sec == "questions":
        questions = blocks.get("questions") or []
        if not questions:
            return ""
        return "Reflection questions.\n\n" + "\n\n".join(f"Question {i+1}. {q}" for i, q in enumerate(questions))

    if sec == "closing_prayer":
        text = blocks.get("closing_prayer") or ""
        return f"Closing prayer. {text}" if text else ""

    if sec == "scripture":
        parts: list[str] = []
        if session is not None and getattr(target_day, "id", None) is not None:
            passages = session.exec(
                select(DayPassage).where(DayPassage.study_day_id == target_day.id).order_by(DayPassage.order)
            ).all()
            for p in passages:
                if p.text:
                    parts.append(f"{p.ref}. {p.text}")
        if not parts and isinstance(blocks.get("scripture"), list):
            for sc in blocks.get("scripture"):
                ref = sc.get("ref", "") if isinstance(sc, dict) else ""
                txt = sc.get("text", "") if isinstance(sc, dict) else str(sc)
                parts.append(f"{ref}. {txt}" if ref else txt)
        return "Scripture reading.\n\n" + "\n\n".join(parts) if parts else ""

    # "all": Opening prayer, Scripture reading, Commentary, Questions, Closing prayer
    parts: list[str] = []

    def add(label: str, text: str | None) -> None:
        if not text:
            return
        parts.append(f"{label}. {text}")

    add("Opening prayer", blocks.get("opening_prayer"))

    scripture_parts: list[str] = []
    if session is not None and getattr(target_day, "id", None) is not None:
        passages = session.exec(
            select(DayPassage).where(DayPassage.study_day_id == target_day.id).order_by(DayPassage.order)
        ).all()
        for p in passages:
            if p.text:
                scripture_parts.append(f"{p.ref}. {p.text}")
    if not scripture_parts and isinstance(blocks.get("scripture"), list):
        for sc in blocks.get("scripture"):
            ref = sc.get("ref", "") if isinstance(sc, dict) else ""
            txt = sc.get("text", "") if isinstance(sc, dict) else str(sc)
            scripture_parts.append(f"{ref}. {txt}" if ref else txt)
    if scripture_parts:
        parts.append("Scripture reading.\n" + "\n".join(scripture_parts))

    add("Commentary", blocks.get("commentary"))
    for q in blocks.get("questions") or []:
        add("Question", q)
    add("Closing prayer", blocks.get("closing_prayer"))

    if not parts:
        return ""
    return "\n\n".join(parts)


def _gtts_params_for_voice(voice: str) -> tuple[str, str]:
    """Map a voice identifier to (lang, tld) for gTTS."""
    if voice in VOICE_SPECS:
        return VOICE_SPECS[voice]["lang"], VOICE_SPECS[voice]["tld"]
    if voice.startswith("gtts-"):
        code = voice.split("-", 1)[1] or "en"
        return code, "com"
    return "en", "com"


def _gtts_lang_for_voice(voice: str) -> str:
    """Map a gtts-\"lang\" voice code to a gTTS lang code (backwards compat)."""
    lang, _ = _gtts_params_for_voice(voice)
    return lang


async def _render_with_gtts(asset: Asset, script: str, voice: str) -> bool:
    """Render with gTTS.  Returns True on success."""
    try:
        from gtts import gTTS
    except Exception:  # noqa: BLE001
        asset.error = "gTTS unavailable in this environment"
        asset.media_type = ""
        asset.content = b""
        return False

    lang, tld = _gtts_params_for_voice(voice)
    import tempfile
    tmp = Path(tempfile.gettempdir()) / f"tts-{asset.id}-gtts.mp3"
    try:
        tts = gTTS(script, lang=lang, tld=tld)
        tts.save(str(tmp))
        asset.provider = "gtts"
        asset.model = voice
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


@router.get("/sample")
def tts_sample(
    voice: str = Query(default="gtts-en"),
    text: Optional[str] = Query(default=None),
) -> Any:
    """Return a short audio sample MP3 for the given voice."""
    from fastapi.responses import Response

    sample_text = (text or "").strip()
    if not sample_text:
        if "es" in voice:
            sample_text = "Lámpara es a mis pies tu palabra, y lumbrera a mi camino."
        elif "fr" in voice:
            sample_text = "Ta parole est une lampe à mes pieds, et une lumière sur mon sentier."
        elif "de" in voice:
            sample_text = "Dein Wort ist meines Fußes Leuchte und ein Licht auf meinem Wege."
        elif "el" in voice:
            sample_text = "Ο λόγος σου είναι λύχνος για τα πόδια μου."
        elif "la" in voice:
            sample_text = "Lucerna pedibus meis verbum tuum, et lumen semitis meis."
        else:
            sample_text = "The Lord is my shepherd, I shall not want. Faith comes by hearing."

    cache_key = f"{voice}:{sample_text}"
    if cache_key in _sample_cache:
        return Response(
            content=_sample_cache[cache_key],
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f"inline; filename=sample-{voice}.mp3",
                "Cache-Control": "public, max-age=86400",
            },
        )

    try:
        from gtts import gTTS
        import tempfile
        lang, tld = _gtts_params_for_voice(voice)
        tmp = Path(tempfile.gettempdir()) / f"tts-sample-{abs(hash(cache_key))}.mp3"
        tts = gTTS(sample_text, lang=lang, tld=tld)
        tts.save(str(tmp))
        content = tmp.read_bytes()
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        _sample_cache[cache_key] = content
        return Response(
            content=content,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f"inline; filename=sample-{voice}.mp3",
                "Cache-Control": "public, max-age=86400",
            },
        )
    except Exception as exc:
        logger.exception("Failed to render voice sample for %s", voice)
        raise HTTPException(500, f"Sample rendering failed: {exc}")


class TTSRenderIn(BaseModel):
    study_id: int
    day_number: int
    voice: str  # gtts-"lang", e.g. "gtts-en" or "gtts-en_US"
    section: Optional[str] = "all"
    custom_text: Optional[str] = None


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

    script = _passage_text_for_day(target, section=body.section, session=session, custom_text=body.custom_text)
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
        prompt=body.section or "all",
        status="rendering",
        error="",
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)

    events.emit(
        "info", "tts",
        f"TTS render started for study {body.study_id} day {body.day_number} section {body.section or 'all'} (asset {asset.id})",
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
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
) -> Any:
    from fastapi.responses import Response

    asset = session.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(404, "asset not found")

    if user is not None and getattr(asset, "study_day_id", None) is not None:
        day = session.get(StudyDay, asset.study_day_id)
        if day is not None:
            study = session.get(Study, day.study_id)
            if study is not None and study.user_id is not None and study.user_id != user.id and not getattr(user, "is_admin", False):
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
