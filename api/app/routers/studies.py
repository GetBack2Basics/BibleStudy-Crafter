"""Study CRUD + background generation.

POST /api/studies      -> create + enqueue outline, return 202 {study_id, status}
GET  /api/studies      -> list
GET  /api/studies/{id} -> poll status; day 1 generated eagerly
POST /api/studies/{id}/days/{n} -> generate (or regenerate) day n on demand

Status values (plain strings, mirrored from the Study/StudyDay model):
  pending | generating | ready | failed
"""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.config import get_settings
from app.db import get_engine, get_session
from app.models import Study, StudyDay, DayPassage, Asset
from app.services import events
from app.services.studies import generate_day as study_generate_day

router = APIRouter(prefix="/api/studies", tags=["studies"])

STATUSES = ("pending", "generating", "ready", "failed")


class StudyCreate(BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)
    minutes_per_day: int = Field(15, ge=5, le=120)
    total_days: int = Field(7, ge=1, le=90)
    tradition: str | None = None
    imagery_policy: str | None = None
    primary_translation: str = "KJV"
    selected_refs: list[str] | None = None   # user-curated verse pool from corpus search


class DayOut(BaseModel):
    day_number: int
    title: str = ""
    theme: str = ""
    status: str
    context_summary: str = ""
    notes: dict[str, Any] | None = None
    blocks_json: dict[str, Any] | None = None


class StudyOut(BaseModel):
    id: int
    topic: str
    title: str = ""
    minutes_per_day: int
    total_days: int
    tradition: str
    imagery_policy: str
    primary_translation: str
    status: str
    verse_pool: list[str] | None = None
    outline_json: dict[str, Any] | None = None
    history_json: dict[str, Any] | None = None
    days: list[DayOut]


def _to_out(s: Study) -> StudyOut:
    return StudyOut(
        id=s.id, topic=s.topic, title=s.title or "",
        minutes_per_day=s.minutes_per_day, total_days=s.total_days,
        tradition=s.tradition, imagery_policy=s.imagery_policy,
        primary_translation=s.primary_translation, status=s.status,
        verse_pool=s.verse_pool, outline_json=s.outline_json,
        history_json=s.history_json,
        days=[DayOut(day_number=d.day_number, title=d.title, theme=d.theme,
                     status=d.status, context_summary=d.context_summary,
                     notes=d.notes, blocks_json=d.blocks_json) for d in s.days],
    )


@router.post("", status_code=202)
async def create_study(body: StudyCreate) -> dict[str, Any]:
    settings = get_settings()
    s = Study(
        topic=body.topic, minutes_per_day=body.minutes_per_day,
        total_days=body.total_days,
        tradition=body.tradition or settings.default_tradition,
        imagery_policy=body.imagery_policy or settings.default_imagery_policy,
        primary_translation=body.primary_translation,
        verse_pool=body.selected_refs,
        status="generating",
    )
    s.days = [StudyDay(day_number=n, status="pending")
              for n in range(1, body.total_days + 1)]

    with Session(get_engine()) as session:
        session.add(s)
        session.commit()
        session.refresh(s)
        study_id = s.id

    events.emit("info", "study", f"Study {study_id} created: {body.topic}", study_id=study_id, progress=5)
    asyncio.create_task(_build_outline_and_day1(study_id, body))
    return {"study_id": study_id, "status": "generating"}


async def _build_outline_and_day1(study_id: int, body: StudyCreate) -> None:
    with Session(get_engine()) as session:
        study = session.get(Study, study_id)
        if study is None:
            return
        try:
            from app.services.planner import generate_outline
            events.emit("info", "study", f"Study {study_id}: drafting outline…", study_id=study_id, progress=25)
            outline = await generate_outline(
                body.topic, body.minutes_per_day, body.total_days,
                tradition=study.tradition, session=session, study_id=study_id)
            study.title = outline.title
            # Distribute the curated verse pool across the study's days so day 1
            # doesn't absorb everything. Ordered canonically (chronological) then
            # round-robin so each day gets a balanced share.
            pool = list(study.verse_pool or [])
            if pool:
                def _sort_key(r: str):
                    from app.services.bible_service import safe_parse_ref
                    ref = safe_parse_ref(r)
                    return (ref.book if ref else 999, ref.chapter if ref else 999, ref.verse_start if ref else 999, r)
                pool.sort(key=_sort_key)
                total = study.total_days
                # round-robin buckets: day 1 first, then 2, ... wrapping
                buckets: dict[int, list[str]] = {n: [] for n in range(1, total + 1)}
                for i, ref in enumerate(pool):
                    buckets[(i % total) + 1].append(ref)
            outline_days = []
            for d in outline.days:
                day_dict = {"day_number": d.day_number, "title": d.title, "focus": d.focus,
                            "est_minutes": d.est_minutes,
                            "suggested_passages": [{"ref": p.ref, "rationale": p.rational}
                                                   for p in d.suggested_passages]}
                # Spread the user's verse pool across all days (chronological, round-robin).
                if pool and day_dict["day_number"] in buckets:
                    if buckets[day_dict["day_number"]]:
                        day_dict["suggested_passages"] = [
                            {"ref": r, "rationale": "chosen by you from the corpus search"}
                            for r in buckets[day_dict["day_number"]]]
                outline_days.append(day_dict)
            study.outline_json = {
                "title": outline.title,
                "summary": outline.summary,
                "days": outline_days,
            }
            by_num = {d.day_number: d for d in study.days}
            for od in outline.days:
                stub = by_num.get(od.day_number)
                if stub:
                    stub.title = od.title
                    stub.theme = od.focus
            session.commit()
            events.emit("success", "study",
                        f"Study {study_id} outline ready ({len(outline.days)} days)", study_id=study_id, progress=60)
            events.emit("info", "study", f"Study {study_id}: writing day 1…", study_id=study_id, progress=75)
            await study_generate_day(study, 1, session=session,
                                     tradition=study.tradition,
                                     translation=study.primary_translation)
            study.status = "ready"
            session.commit()
            events.emit("success", "study", f"Study {study_id} day 1 generated", study_id=study_id, progress=100)
        except Exception as exc:           # noqa: BLE001 - background job
            study.status = "failed"
            session.commit()
            events.emit("error", "study",
                        f"Study {study_id} failed: {type(exc).__name__}: {exc}")
            raise


@router.get("")
def list_studies(session: Session = Depends(get_session)) -> list[StudyOut]:
    from sqlmodel import select
    rows = session.exec(select(Study).order_by(Study.id.desc())).all()
    return [_to_out(s) for s in rows]


@router.get("/{study_id}")
def get_study(study_id: int, session: Session = Depends(get_session)) -> StudyOut:
    s = session.get(Study, study_id)
    if s is None:
        raise HTTPException(404, "study not found")
    return _to_out(s)


def _delete_study_data(session: Session, study: Study) -> None:
    """Remove one study's data (days, passages, assets) without touching the Bible corpus."""
    from sqlalchemy import text
    eng = session.get_bind()
    day_ids = [d.id for d in study.days]
    if day_ids:
        placeholders = ",".join(str(i) for i in day_ids)
        session.exec(text(f"DELETE FROM day_passage WHERE study_day_id IN ({placeholders})"))
        session.exec(text(f"DELETE FROM asset WHERE study_day_id IN ({placeholders})"))
    for d in study.days:
        session.delete(d)
    session.delete(study)
    session.commit()


@router.delete("/_all")
def delete_all_studies(session: Session = Depends(get_session)) -> dict:
    """Delete ALL studies (days, passages, assets) but keep the Bible translations/verses.

    Use this instead of wiping the DB when you only want to clear your study work.
    Registered before /{study_id} so '_all' is not parsed as a study id.
    """
    from sqlmodel import select
    studies = session.exec(select(Study)).all()
    count = len(studies)
    for s in studies:
        _delete_study_data(session, s)
    events.emit("success", "study", f"All {count} studies deleted")
    return {"deleted": count}


@router.delete("/{study_id}")
def delete_study(study_id: int, session: Session = Depends(get_session)) -> dict:
    """Delete a single study (its days, passages, assets). Bible corpus is preserved."""
    s = session.get(Study, study_id)
    if s is None:
        raise HTTPException(404, "study not found")
    _delete_study_data(session, s)
    events.emit("success", "study", f"Study {study_id} deleted")
    return {"deleted": study_id}


@router.post("/{study_id}/days/{day_number}")
async def generate_day_endpoint(study_id: int, day_number: int,
                                session: Session = Depends(get_session)) -> dict:
    s = session.get(Study, study_id)
    if s is None:
        raise HTTPException(404, "study not found")
    if day_number < 1 or day_number > s.total_days:
        raise HTTPException(400, "day out of range")
    try:
        draft = await study_generate_day(s, day_number, session=session,
                                         tradition=s.tradition,
                                         translation=s.primary_translation)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"day_number": day_number, "status": "ready", "draft": draft}


class DayUpdate(BaseModel):
    blocks_json: dict[str, Any]
    notes: dict[str, Any] | None = None   # user notes on commentary/prayers sections


class DayRevise(BaseModel):
    instruction: str
    selection: str | None = None


REVISE_PROMPT = """You are helping a user revise part of a Bible-study day they wrote.

The scripture passages chosen for this day (quote their references only - the
app inserts the actual verse text from its own Bible database; do NOT invent or
rewrite any verse, but you MUST ground the commentary and prayers on these
passages):
---
{scripture}
---

The full current commentary for the day is:
---
{commentary}
---

{selection_block}Revise according to this instruction: {instruction}

Return ONLY the revised text (no markdown fences, no commentary about what you changed). If a selection was provided, return only the revised version of that selected passage, keeping its meaning and length similar. If no selection was provided, return the revised full commentary. The revision must stay faithful to the scripture passages above.
"""

SCRIPTURE_BLOCK = "- {ref} ({translation}): {text}"


@router.post("/{study_id}/days/{day_number}/revise")
async def revise_day_endpoint(study_id: int, day_number: int, body: DayRevise,
                              session: Session = Depends(get_session)) -> dict:
    """Revise a day's commentary with AI. If `selection` is given, only that
    passage is revised (JobHunt_Crafter-style select-to-revise)."""
    from app.services.llm import NoProviderAvailable, complete
    from app.services.prompts import build_system
    from sqlmodel import select
    from app.models import DayPassage

    s = session.get(Study, study_id)
    if s is None:
        raise HTTPException(404, "study not found")
    target = next((d for d in s.days if d.day_number == day_number), None)
    if target is None:
        raise HTTPException(400, "day out of range")
    commentary = (target.blocks_json or {}).get("commentary", "") if target.blocks_json else ""
    if not commentary:
        raise HTTPException(400, "day has no commentary to revise yet")

    # Ground the revision on the day's chosen scripture passages.
    passages = session.exec(
        select(DayPassage).where(DayPassage.study_day_id == target.id)
        .order_by(DayPassage.order)
    ).all()
    scripture_block = "\n".join(
        SCRIPTURE_BLOCK.format(ref=p.ref, translation=p.translation, text=p.text)
        for p in passages
    ) or "(no passages selected for this day)"

    selection_block = (
        f"The user selected this passage to revise:\n---\n{body.selection}\n---\n"
        if body.selection else ""
    )
    prompt = REVISE_PROMPT.format(
        scripture=scripture_block, commentary=commentary,
        selection_block=selection_block, instruction=body.instruction)
    try:
        res = await complete(prompt, system=build_system(tradition=s.tradition),
                             study_id=study_id, session=session)
    except NoProviderAvailable as exc:
        raise HTTPException(502, str(exc))
    revised = res.text.strip()
    target.blocks_json = {**(target.blocks_json or {}), "commentary": revised}
    session.add(target)
    session.commit()
    events.emit("success", "study", f"Study {study_id} day {day_number} revised")
    return {"day_number": day_number, "revised": revised,
            "selection": body.selection}


@router.put("/{study_id}/days/{day_number}")
def update_day_endpoint(study_id: int, day_number: int, body: DayUpdate,
                        session: Session = Depends(get_session)) -> dict:
    """Persist user edits to a day's blocks_json (inline editing)."""
    from app.services.planner import make_summary

    s = session.get(Study, study_id)
    if s is None:
        raise HTTPException(404, "study not found")
    target = next((d for d in s.days if d.day_number == day_number), None)
    if target is None:
        raise HTTPException(400, "day out of range")

    target.blocks_json = body.blocks_json
    if body.notes is not None:
        target.notes = body.notes
    if target.status == "pending":
        target.status = "ready"
    target.context_summary = make_summary(body.blocks_json, target.context_summary)
    session.add(target)
    session.commit()
    session.refresh(target)
    events.emit("info", "study", f"Study {study_id} day {day_number} edited")
    return _to_out(s).model_dump()["days"][day_number - 1]
