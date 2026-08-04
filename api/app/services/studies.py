"""Rolling context for multi-day studies (decision 5).

generate_day(N) must receive ONLY day N-1's <=120-word summary plus the
outline - never the full text of prior days. This keeps the prompt bounded and
cheap as the study grows, and is what makes long studies affordable on the
free tier.
"""
from __future__ import annotations

from typing import Any

from sqlmodel import Session

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
    )

    target.blocks_json = draft
    target.status = "ready"
    # Rolling summary for the NEXT day (decision 5)
    target.context_summary = make_summary(draft, prior_summary)
    session.add(target)
    session.commit()
    session.refresh(target)
    return draft


def _passages_for(study: Study, day_number: int) -> list[Passage]:
    """Suggested passages for a day come from the outline JSON."""
    outline = study.outline_json or {}
    for d in outline.get("days", []):
        if d.get("day_number") == day_number:
            return [Passage(ref=p["ref"], rational=p.get("rationale", ""))
                    for p in d.get("suggested_passages", [])]
    return []
