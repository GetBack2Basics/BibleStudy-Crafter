"""Asset management, AI art prompt crafting, and image/infographic rendering router."""
from __future__ import annotations

import asyncio
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import get_current_user, get_current_user_optional
from app.config import get_settings
from app.db import get_engine, get_session
from app.models import Asset, Study, StudyDay, User
from app.services import art_service, events

router = APIRouter(tags=["assets"])


# ------------------------------------------------------------- Pydantic Schemas

class PresetOut(BaseModel):
    styles: list[dict[str, Any]]
    moods: list[dict[str, Any]]
    aspect_ratios: list[dict[str, Any]]


class SuggestPromptIn(BaseModel):
    style_id: str = "classical_oil"
    mood_id: str = "peaceful_contemplative"
    custom_guidance: str = ""


class SuggestPromptOut(BaseModel):
    cover_art_prompt: str
    infographic_art_prompt: str
    artistic_rationale: str
    negative_prompt: str
    style_id: str
    mood_id: str


class RenderArtIn(BaseModel):
    kind: str = Field(..., description="cover_art | infographic | image")
    prompt: str = Field(..., min_length=1, max_length=2000)
    style_preset: str = ""
    aspect_ratio: str = "16:9"
    is_active: bool = True


class RenderArtOut(BaseModel):
    asset_id: int
    status: str
    message: str = ""


class InfographicPillar(BaseModel):
    title: str
    icon: str
    insight: str
    scripture_ref: str = ""
    key_phrase: str = ""


class InfographicKeyVerse(BaseModel):
    ref: str
    text: str


class StructuredInfographicOut(BaseModel):
    title: str
    central_thesis: str
    pillars: list[InfographicPillar]
    key_verse: InfographicKeyVerse
    practical_walkaway: str


class AssetOut(BaseModel):
    id: int
    study_day_id: int
    kind: str
    provider: str = ""
    model: str = ""
    prompt: str = ""
    style_preset: str = ""
    media_type: str = ""
    is_active: bool = True
    status: str
    error: Optional[str] = None
    cost_usd: float = 0.0
    meta_json: Optional[dict[str, Any]] = None
    has_content: bool = False
    created_at: str


# --------------------------------------------------------------------- Endpoints

@router.get("/api/art/presets", response_model=PresetOut)
def get_presets() -> PresetOut:
    """Return all available artistic style presets, mood presets, and aspect ratios."""
    return PresetOut(
        styles=art_service.STYLE_PRESETS,
        moods=art_service.MOOD_PRESETS,
        aspect_ratios=art_service.ASPECT_RATIOS,
    )


@router.get("/api/studies/{study_id}/days/{day_number}/assets", response_model=List[AssetOut])
def list_day_assets(
    study_id: int,
    day_number: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[AssetOut]:
    """List all assets (cover art, infographics, audio) for a specific study day."""
    study = session.get(Study, study_id)
    if study is None or study.user_id != user.id:
        raise HTTPException(404, "study not found")

    day = next((d for d in study.days if d.day_number == day_number), None)
    if day is None:
        raise HTTPException(404, "day not found")

    assets = session.exec(
        select(Asset)
        .where(Asset.study_day_id == day.id)
        .order_by(Asset.created_at.desc())
    ).all()

    return [
        AssetOut(
            id=a.id,
            study_day_id=a.study_day_id,
            kind=a.kind,
            provider=a.provider,
            model=a.model,
            prompt=a.prompt,
            style_preset=getattr(a, "style_preset", "") or "",
            media_type=a.media_type,
            is_active=getattr(a, "is_active", True),
            status=a.status,
            error=a.error,
            cost_usd=a.cost_usd,
            meta_json=getattr(a, "meta_json", None),
            has_content=bool(a.content and len(a.content) > 0),
            created_at=a.created_at.isoformat(),
        )
        for a in assets
    ]


@router.post("/api/studies/{study_id}/days/{day_number}/art/suggest-prompt", response_model=SuggestPromptOut)
async def suggest_prompt_for_day(
    study_id: int,
    day_number: int,
    body: SuggestPromptIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SuggestPromptOut:
    """AI Prompt Crafter: Generate optimized cover art and infographic prompts anchored in Scripture."""
    study = session.get(Study, study_id)
    if study is None or study.user_id != user.id:
        raise HTTPException(404, "study not found")

    day = next((d for d in study.days if d.day_number == day_number), None)
    if day is None:
        raise HTTPException(404, "day not found")

    res = await art_service.suggest_art_prompts(
        study=study,
        day=day,
        style_id=body.style_id,
        mood_id=body.mood_id,
        custom_guidance=body.custom_guidance,
    )
    return SuggestPromptOut(**res)


@router.post("/api/studies/{study_id}/days/{day_number}/art/render", status_code=202, response_model=RenderArtOut)
async def render_art_for_day(
    study_id: int,
    day_number: int,
    body: RenderArtIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RenderArtOut:
    """Enqueue AI image generation for Day Cover Art or Infographic Poster."""
    study = session.get(Study, study_id)
    if study is None or study.user_id != user.id:
        raise HTTPException(404, "study not found")

    day = next((d for d in study.days if d.day_number == day_number), None)
    if day is None:
        raise HTTPException(404, "day not found")

    if not body.prompt.strip():
        raise HTTPException(400, "prompt cannot be empty")

    # If new asset is active, mark previous ones inactive
    if body.is_active:
        prev_assets = session.exec(
            select(Asset).where(
                Asset.study_day_id == day.id,
                Asset.kind == body.kind,
            )
        ).all()
        for pa in prev_assets:
            pa.is_active = False
            session.add(pa)

    asset = Asset(
        user_id=user.id,
        study_day_id=day.id,
        kind=body.kind,
        prompt=body.prompt.strip(),
        style_preset=body.style_preset,
        is_active=body.is_active,
        status="rendering",
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)

    events.emit(
        "info",
        "art",
        f"Art generation started for study {study_id} day {day_number} ({body.kind} asset {asset.id})",
        study_id=study_id,
    )

    # Launch background renderer
    engine = session.get_bind()
    asyncio.create_task(
        art_service.render_image_asset(
            asset_id=asset.id,
            prompt=body.prompt.strip(),
            aspect_ratio=body.aspect_ratio,
            engine=engine,
        )
    )

    return RenderArtOut(asset_id=asset.id, status="rendering", message="Render job queued")


@router.post("/api/studies/{study_id}/days/{day_number}/infographic/structured", response_model=StructuredInfographicOut)
async def get_structured_infographic(
    study_id: int,
    day_number: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StructuredInfographicOut:
    """Extract key learning pillars, central thesis, and practical walkaway for native infographic rendering."""
    study = session.get(Study, study_id)
    if study is None or study.user_id != user.id:
        raise HTTPException(404, "study not found")

    day = next((d for d in study.days if d.day_number == day_number), None)
    if day is None:
        raise HTTPException(404, "day not found")

    data = await art_service.extract_structured_infographic(study, day)
    return StructuredInfographicOut(**data)


@router.post("/api/studies/{study_id}/days/{day_number}/infographic/svg", response_model=AssetOut)
async def generate_svg_infographic_asset(
    study_id: int,
    day_number: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AssetOut:
    """Generate and store a zero-cost, high-resolution SVG Key Learnings Infographic asset."""
    study = session.get(Study, study_id)
    if study is None or study.user_id != user.id:
        raise HTTPException(404, "study not found")

    day = next((d for d in study.days if d.day_number == day_number), None)
    if day is None:
        raise HTTPException(404, "day not found")

    info_data = await art_service.extract_structured_infographic(study, day)
    svg_str = art_service.generate_svg_infographic(info_data)

    # Deactivate previous active infographic assets
    prev_assets = session.exec(
        select(Asset).where(
            Asset.study_day_id == day.id,
            Asset.kind == "infographic",
        )
    ).all()
    for pa in prev_assets:
        pa.is_active = False
        session.add(pa)

    asset = Asset(
        user_id=user.id,
        study_day_id=day.id,
        kind="infographic",
        provider="native_svg",
        model="svg-key-learnings",
        prompt=info_data.get("title", "Key Learnings"),
        style_preset="modern_minimalist",
        media_type="image/svg+xml",
        content=svg_str.encode("utf-8"),
        status="ready",
        is_active=True,
        meta_json=info_data,
        cost_usd=0.0,
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)

    events.emit("success", "art", f"SVG Infographic created for day {day_number} (asset {asset.id})", study_id=study_id)

    return AssetOut(
        id=asset.id,
        study_day_id=asset.study_day_id,
        kind=asset.kind,
        provider=asset.provider,
        model=asset.model,
        prompt=asset.prompt,
        style_preset=asset.style_preset,
        media_type=asset.media_type,
        is_active=asset.is_active,
        status=asset.status,
        error=asset.error,
        cost_usd=asset.cost_usd,
        meta_json=asset.meta_json,
        has_content=True,
        created_at=asset.created_at.isoformat(),
    )


@router.put("/api/studies/{study_id}/days/{day_number}/assets/{asset_id}/active", response_model=AssetOut)
def set_active_asset(
    study_id: int,
    day_number: int,
    asset_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AssetOut:
    """Set a specific asset variation as the primary active version for the day."""
    study = session.get(Study, study_id)
    if study is None or study.user_id != user.id:
        raise HTTPException(404, "study not found")

    day = next((d for d in study.days if d.day_number == day_number), None)
    if day is None:
        raise HTTPException(404, "day not found")

    target = session.get(Asset, asset_id)
    if target is None or target.study_day_id != day.id:
        raise HTTPException(404, "asset not found")

    # Set all other assets of same kind to inactive
    siblings = session.exec(
        select(Asset).where(
            Asset.study_day_id == day.id,
            Asset.kind == target.kind,
        )
    ).all()
    for s in siblings:
        s.is_active = (s.id == target.id)
        session.add(s)

    session.commit()
    session.refresh(target)

    return AssetOut(
        id=target.id,
        study_day_id=target.study_day_id,
        kind=target.kind,
        provider=target.provider,
        model=target.model,
        prompt=target.prompt,
        style_preset=getattr(target, "style_preset", "") or "",
        media_type=target.media_type,
        is_active=target.is_active,
        status=target.status,
        error=target.error,
        cost_usd=target.cost_usd,
        meta_json=getattr(target, "meta_json", None),
        has_content=bool(target.content and len(target.content) > 0),
        created_at=target.created_at.isoformat(),
    )


@router.delete("/api/studies/{study_id}/days/{day_number}/assets/{asset_id}")
def delete_asset(
    study_id: int,
    day_number: int,
    asset_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Delete an asset."""
    study = session.get(Study, study_id)
    if study is None or study.user_id != user.id:
        raise HTTPException(404, "study not found")

    day = next((d for d in study.days if d.day_number == day_number), None)
    if day is None:
        raise HTTPException(404, "day not found")

    target = session.get(Asset, asset_id)
    if target is None or target.study_day_id != day.id:
        raise HTTPException(404, "asset not found")

    was_active = target.is_active
    kind = target.kind
    session.delete(target)
    session.commit()

    # If it was active, activate the most recent remaining one of same kind
    if was_active:
        remaining = session.exec(
            select(Asset)
            .where(Asset.study_day_id == day.id, Asset.kind == kind)
            .order_by(Asset.created_at.desc())
        ).first()
        if remaining:
            remaining.is_active = True
            session.add(remaining)
            session.commit()

    return {"deleted": True, "asset_id": asset_id}


@router.get("/api/assets/{asset_id}")
def get_asset_media(
    asset_id: int,
    download: bool = Query(False),
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
) -> Any:
    """Stream or download asset content bytes with correct MIME type."""
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(404, "asset not found")

    if user is not None and getattr(asset, "study_day_id", None):
        day = session.get(StudyDay, asset.study_day_id)
        if day is not None:
            study = session.get(Study, day.study_id)
            if study is not None and study.user_id is not None and study.user_id != user.id and not getattr(user, "is_admin", False):
                raise HTTPException(404, "asset not found")

    if asset.status == "rendering" or asset.status == "queued":
        raise HTTPException(202, "asset still rendering")
    if asset.status == "failed":
        raise HTTPException(409, asset.error or "asset rendering failed")
    if not asset.content:
        raise HTTPException(404, "asset has no content")

    ext = "png"
    if "jpeg" in asset.media_type or "jpg" in asset.media_type:
        ext = "jpg"
    elif "svg" in asset.media_type:
        ext = "svg"
    elif "mp3" in asset.media_type or "audio" in asset.media_type:
        ext = "mp3"
    elif "webp" in asset.media_type:
        ext = "webp"

    disposition = "attachment" if download else "inline"
    filename = f"{asset.kind}-{asset.id}.{ext}"

    return Response(
        content=asset.content,
        media_type=asset.media_type or "image/png",
        headers={
            "Content-Disposition": f"{disposition}; filename={filename}",
            "Cache-Control": "public, max-age=3600",
        },
    )
