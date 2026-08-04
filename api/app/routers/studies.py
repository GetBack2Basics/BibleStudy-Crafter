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
from app.models import Study, StudyDay
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


class DayOut(BaseModel):
    day_number: int
    title: str = ""
    theme: str = ""
    status: str
    context_summary: str = ""
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
    days: list[DayOut]


def _to_out(s: Study) -> StudyOut:
    return StudyOut(
        id=s.id, topic=s.topic, title=s.title or "",
        minutes_per_day=s.minutes_per_day, total_days=s.total_days,
        tradition=s.tradition, imagery_policy=s.imagery_policy,
        primary_translation=s.primary_translation, status=s.status,
        days=[DayOut(day_number=d.day_number, title=d.title, theme=d.theme,
                     status=d.status, context_summary=d.context_summary,
                     blocks_json=d.blocks_json) for d in s.days],
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
        status="generating",
    )
    s.days = [StudyDay(day_number=n, status="pending")
              for n in range(1, body.total_days + 1)]

    with Session(get_engine()) as session:
        session.add(s)
        session.commit()
        session.refresh(s)
        study_id = s.id

    events.emit("info", "study", f"Study {study_id} created: {body.topic}")
    asyncio.create_task(_build_outline_and_day1(study_id, body))
    return {"study_id": study_id, "status": "generating"}


async def _build_outline_and_day1(study_id: int, body: StudyCreate) -> None:
    with Session(get_engine()) as session:
        study = session.get(Study, study_id)
        if study is None:
            return
        try:
            from app.services.planner import generate_outline
            outline = await generate_outline(
                body.topic, body.minutes_per_day, body.total_days,
                tradition=study.tradition, session=session, study_id=study_id)
            study.title = outline.title
            study.outline_json = {
                "title": outline.title,
                "summary": outline.summary,
                "days": [
                    {"day_number": d.day_number, "title": d.title, "focus": d.focus,
                     "est_minutes": d.est_minutes,
                     "suggested_passages": [{"ref": p.ref, "rationale": p.rational}
                                            for p in d.suggested_passages]}
                    for d in outline.days
                ],
            }
            by_num = {d.day_number: d for d in study.days}
            for od in outline.days:
                stub = by_num.get(od.day_number)
                if stub:
                    stub.title = od.title
                    stub.theme = od.focus
            study.status = "ready"
            session.commit()
            events.emit("success", "study",
                        f"Study {study_id} outline ready ({len(outline.days)} days)")
            await study_generate_day(study, 1, session=session,
                                     tradition=study.tradition)
            events.emit("success", "study", f"Study {study_id} day 1 generated")
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
                                         tradition=s.tradition)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"day_number": day_number, "status": "ready", "draft": draft}
