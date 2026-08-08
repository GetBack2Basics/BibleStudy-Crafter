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
from app.services import events
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

    # Day N reads ALL prior days via the compressed rolling history (plan decision).
    prior_summary = get_compressed_history(getattr(study, "history_json", None)) or None

    passages = _passages_for(study, day_number)
    # Fallback: if the outline/model suggested no passages, mine the local
    # corpus by topic so every day still gets real scripture (never blank).
    if not passages:
        query = (target.theme or study.title or study.topic)
        passages = _corpus_passages(query, translation)

    # Ground the prayer in the previous day's actual scripture when it exists.
    prev_scripture = None
    if day_number > 1:
        prev = next((d for d in days if d.day_number == day_number - 1), None)
        if prev and prev.blocks_json and prev.blocks_json.get("scripture"):
            prev_scripture = "\n".join(
                f"{s.get('ref')} ({prev.translation or translation}): {s.get('text', '')}"
                for s in prev.blocks_json["scripture"]
            ) or None

    draft = await _generate_day(
        title=study.title or study.topic,
        focus=target.theme,
        passages=passages,
        minutes=study.minutes_per_day,
        day=day_number,
        prior_summary=prior_summary,
        prev_scripture=prev_scripture,
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
    # Rolling summary for the NEXT day (decision 5) + advance compressed history.
    target.context_summary = make_summary(draft, prior_summary)
    if hasattr(study, "history_json"):
        study.history_json = update_history(study.history_json, day_number,
                                            target.context_summary)
    session.add(target)
    session.commit()
    session.refresh(target)
    return draft


def day_verse_refs(day: "StudyDay") -> list[str]:
    """The verse references attached to a day (from its passages)."""
    refs: list[str] = []
    if getattr(day, "id", None) is not None and hasattr(day, "passages"):
        try:
            for p in day.passages:           # type: ignore[attr-defined]
                if getattr(p, "ref", None):
                    refs.append(p.ref)
        except Exception:                    # noqa: BLE001 - relationships may be unset
            pass
    if not refs and day.blocks_json:
        refs = [s.get("ref") for s in day.blocks_json.get("scripture", [])
                if s.get("ref")]
    return refs


async def build_day_discussions(study: Study, day_number: int, *, session: Session,
                                study_id: int | None = None) -> dict[str, Any] | None:
    """Fetch real, cited discussions for a day's verses and persist them.

    Fire-and-forget after a day is ready; never raises into the caller.
    """
    from app.models import StudyDay
    from app.services import discussions as disc
    days = sorted(study.days, key=lambda d: d.day_number)
    target = next((d for d in days if d.day_number == day_number), None)
    if target is None or not getattr(target, "id", None):
        return None
    refs = day_verse_refs(target)
    topic = (target.theme or study.title or study.topic or "")
    if not refs and not topic:
        return None
    try:
        result = await disc.build_discussions(
            refs, topic, study.minutes_per_day,
            session=session, study_id=study_id)
    except Exception as exc:               # noqa: BLE001 - discussions are best-effort
        events.emit("warn", "discussions", f"day {day_number} discussions failed: {exc}")
        return None
    target.discussions_json = result
    session.add(target)
    session.commit()
    events.emit("info", "study",
                f"Study {study_id} day {day_number}: gathered "
                f"{len(result.get('sources', []))} cited discussions",
                study_id=study_id)
    return result


# ------------------------------------------------------------------------- history
# Compressed rolling history (plan decision): day N sees ALL prior days, bounded.
# history_json = {"arc": str, "recent": [{"day": int, "summary": str}]}
#  - recent holds the last RECENT_CAP days verbatim (<=120w each)
#  - arc holds everything older, deterministically compressed (no LLM calls)
# Day N therefore receives arc + recent regardless of study length.

RECENT_CAP = 4
ARC_WORD_CAP = 400
DAY_SUMMARY_CAP = 120


def build_day_summary(draft: dict[str, Any]) -> str:
    """<=120-word digest of one day (its own context_summary source)."""
    return make_summary(draft)


def update_history(history: dict | None, day_number: int, day_summary: str,
                   *, recent_cap: int = RECENT_CAP,
                   arc_word_cap: int = ARC_WORD_CAP) -> dict:
    h = history or {"arc": "", "recent": []}
    recent = list(h.get("recent", []))
    arc = h.get("arc", "")
    recent.append({"day": day_number, "summary": day_summary})
    while len(recent) > recent_cap:
        oldest = recent.pop(0)
        arc = (arc + f"\nDay {oldest['day']}: {oldest['summary']}").strip()
        arc = _wordcap(arc, arc_word_cap)
    return {"arc": arc, "recent": recent}


def get_compressed_history(history: dict | None) -> str:
    if not history:
        return ""
    arc = (history.get("arc") or "").strip()
    recent = history.get("recent") or []
    parts = []
    if arc:
        parts.append("OVERALL ARC (compressed prior days):\n" + arc)
    if recent:
        lines = "\n".join(f"Day {r['day']}: {r['summary']}" for r in recent)
        parts.append("RECENT DAYS:\n" + lines)
    return "\n\n".join(parts)


def rebuild_history(study: "Study") -> dict:
    """Re-derive the compressed history from every generated day's blocks_json.

    Used when a day is regenerated/edited so the arc stays consistent.
    """
    days = sorted(study.days, key=lambda d: d.day_number)
    history = None
    for d in days:
        if d.status != "ready" or not d.blocks_json:
            continue
        summary = d.context_summary or build_day_summary(d.blocks_json)
        history = update_history(history, d.day_number, summary)
    return history


def _wordcap(text: str, cap: int) -> str:
    words = text.split()
    if len(words) <= cap:
        return text
    return " ".join(words[:cap]) + " …"


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
