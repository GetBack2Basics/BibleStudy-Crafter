"""Rolling context for multi-day studies (decision 5).

generate_day(N) must receive ONLY day N-1's <=120-word summary plus the
outline - never the full text of prior days. This keeps the prompt bounded and
cheap as the study grows, and is what makes long studies affordable on the
free tier.
"""
from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app.models import Study, StudyDay
from app.services.planner import Passage, generate_day as _generate_day, _corpus_passages
from app.services.prompts import build_system
from app.services.planner import make_summary


async def generate_day(study: Study, day_number: int, *, session: Session,
                       tradition: str | None = None,
                       translation: str = "KJV") -> dict[str, Any]:
    """Generate (or regenerate) one day, pulling only the prior day's summary.

    Returns the blocks_json dict. The StudyDay row is updated in-place and the
    rolling context_summary is written back onto the day for the next one.
    """
    days = sorted(study.days, key=lambda d: d.day_number)
    target = next((d for d in days if d.day_number == day_number), None)
    if target is None:
        raise ValueError(f"study has no day {day_number}")

    prior = next((d for d in days if d.day_number == day_number - 1), None)
    prior_summary = prior.context_summary if prior else None

    passages = _passages_for(study, day_number)
    # Fallback: if the outline/model suggested no passages, mine the local
    # corpus by topic so every day still gets real scripture (never blank).
    if not passages:
        query = (target.theme or study.title or study.topic)
        passages = _corpus_passages(query, translation)
    draft = await _generate_day(
        title=study.title or study.topic,
        focus=target.theme,
        passages=passages,
        minutes=study.minutes_per_day,
        day=day_number,
        prior_summary=prior_summary,
        tradition=tradition,
        session=session,
        study_id=study.id,
        translation=translation,
    )

    target.blocks_json = draft
    target.status = "ready"
    # Persist scripture as first-class, reorderable, version-switchable passages.
    # (Skipped when target isn't a persisted ORM row, e.g. lightweight test fakes.)
    if getattr(target, "id", None) is not None and hasattr(session, "exec"):
        _sync_passages(session, target, draft.get("scripture", []), translation)
    # Rolling summary for the NEXT day (decision 5)
    target.context_summary = make_summary(draft, prior_summary)
    session.add(target)
    session.commit()
    session.refresh(target)
    return draft


def _sync_passages(session: Session, day: "StudyDay", scripture: list[dict], translation: str) -> None:
    """Replace a day's DayPassage rows from the draft's scripture blocks.

    `text` is resolved in the study's primary translation at generation time; the
    user can later switch any passage's version via the passages API.
    """
    from app.models import DayPassage
    # drop existing
    for old in session.exec(
        select(DayPassage).where(DayPassage.study_day_id == day.id)
    ).all():
        session.delete(old)
    for i, s in enumerate(scripture):
        session.add(DayPassage(
            study_day_id=day.id,
            ref=s.get("ref", ""),
            translation=translation,
            text=s.get("text", ""),
            order=i,
            rationale=s.get("rationale", ""),
            highlights=None,
        ))
    session.commit()


def _passages_for(study: Study, day_number: int) -> list[Passage]:
    """Suggested passages for a day come from the outline JSON."""
    outline = study.outline_json or {}
    for d in outline.get("days", []):
        if d.get("day_number") == day_number:
            return [Passage(ref=p["ref"], rational=p.get("rationale", ""))
                    for p in d.get("suggested_passages", [])]
    return []
