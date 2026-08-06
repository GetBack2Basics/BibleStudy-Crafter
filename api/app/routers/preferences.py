"""Per-user (single-user local) preferences: most-used Bible versions.

The verse expander shows a passage in the reader's 3 most-used translations and
lets them switch to any loaded version via a dropdown. We persist an ordered list
of preferred translation codes in the `setting` table (user_id NULL = local user).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import Setting, Translation

router = APIRouter(prefix="/api/preferences", tags=["preferences"])

PREF_KEY = "preferred_translations"
DEFAULTS = ["KJV", "WEB", "ESV"]  # fall back to whatever is actually loaded


class PreferredTranslations(BaseModel):
    translations: list[str]


def _loaded_codes(session: Session) -> list[str]:
    return [t.code for t in session.exec(select(Translation).order_by(Translation.code)).all()]


def _resolve_preferred(session: Session) -> list[str]:
    row = session.exec(
        select(Setting).where(Setting.key == PREF_KEY)
    ).first()
    if row and isinstance(row.value_json, dict) and row.value_json.get("translations"):
        wanted = [c.upper() for c in row.value_json["translations"]]
        loaded = _loaded_codes(session)
        # keep only loaded codes, preserve order, then top up from loaded
        kept = [c for c in wanted if c in loaded]
        for c in loaded:
            if c not in kept:
                kept.append(c)
        return kept[:3]
    # default: first 3 loaded that intersect with DEFAULTS, else first 3 loaded
    loaded = _loaded_codes(session)
    if not loaded:
        return []
    ordered = [c for c in DEFAULTS if c in loaded] + [c for c in loaded if c not in DEFAULTS]
    return ordered[:3]


@router.get("/translations", response_model=PreferredTranslations)
def get_preferred_translations(session: Session = Depends(get_session)) -> PreferredTranslations:
    return PreferredTranslations(translations=_resolve_preferred(session))


@router.post("/translations", response_model=PreferredTranslations)
def set_preferred_translations(
    body: PreferredTranslations, session: Session = Depends(get_session)
) -> PreferredTranslations:
    loaded = set(_loaded_codes(session))
    wanted = [c.upper() for c in body.translations if c.upper() in loaded][:3]
    if not wanted:  # never store an empty preference
        wanted = _resolve_preferred(session)
    row = session.exec(select(Setting).where(Setting.key == PREF_KEY)).first()
    if row is None:
        row = Setting(key=PREF_KEY, value_json={"translations": wanted})
        session.add(row)
    else:
        row.value_json = {"translations": wanted}
    session.commit()
    session.refresh(row)
    return PreferredTranslations(translations=wanted)


def bump_preferred(session: Session, code: str) -> None:
    """Move `code` to the front of the preference list (called when a reader
    switches to a version)."""
    code = code.upper()
    loaded = set(_loaded_codes(session))
    if code not in loaded:
        return
    current = _resolve_preferred(session)
    reordered = [code] + [c for c in current if c != code]
    set_preferred_translations(PreferredTranslations(translations=reordered[:3]),
                               session=session)
