"""Per-day scripture passages: add/remove/reorder, switch version, highlight.

Scripture is now first-class (DayPassage rows), not just embedded JSON. Each
passage carries its own translation so the reader can compare versions per quote,
reorder them, and mark sections for personal reflection.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import DayPassage, Study, StudyDay, Translation, User
from app.services import bible_service as bs

router = APIRouter(prefix="/api/studies", tags=["passages"])


class PassageCreate(BaseModel):
    ref: str
    rationale: str = ""
    translation: str | None = None   # defaults to study primary


class PassageUpdate(BaseModel):
    translation: str | None = None
    order: int | None = None
    highlights: list[dict] | None = None
    rationale: str | None = None
    note: str | None = None   # user reflection note on this verse (stored in highlights)


class PassageOut(BaseModel):
    id: int
    ref: str
    translation: str
    text: str
    order: int
    rationale: str
    highlights: list[dict] | None


def _study_day(session: Session, study_id: int, day_number: int, user: User):
    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    d = next((x for x in s.days if x.day_number == day_number), None)
    if d is None:
        raise HTTPException(400, "day out of range")
    return s, d


def _resolve_text(session: Session, ref: str, translation: str) -> str:
    try:
        parsed = bs.parse_ref(ref)
    except ValueError:
        return ""
    rows = bs.get_passage(session, parsed, translation)
    return " ".join(v["text"] for v in rows)


@router.get("/{study_id}/days/{day_number}/passages", response_model=list[PassageOut])
def list_passages(study_id: int, day_number: int,
                  user: User = Depends(get_current_user),
                  session: Session = Depends(get_session)):
    _, d = _study_day(session, study_id, day_number, user)
    rows = session.exec(
        select(DayPassage).where(DayPassage.study_day_id == d.id).order_by(DayPassage.order)
    ).all()
    return [_out(r) for r in rows]


@router.post("/{study_id}/days/{day_number}/passages", response_model=PassageOut)
def add_passage(study_id: int, day_number: int, body: PassageCreate,
                user: User = Depends(get_current_user),
                session: Session = Depends(get_session)):
    s, d = _study_day(session, study_id, day_number, user)
    tr = body.translation or s.primary_translation
    # verify translation exists
    if not session.get(Translation, tr) and not session.exec(
            select(Translation).where(Translation.code == tr)).first():
        raise HTTPException(400, f"translation not loaded: {tr}")
    order = len(session.exec(
        select(DayPassage).where(DayPassage.study_day_id == d.id)).all())
    text = _resolve_text(session, body.ref, tr)
    p = DayPassage(study_day_id=d.id, ref=body.ref, translation=tr, text=text,
                   order=order, rationale=body.rationale, highlights=None)
    session.add(p)
    session.commit()
    session.refresh(p)
    return _out(p)


@router.put("/{study_id}/days/{day_number}/passages/{passage_id}", response_model=PassageOut)
def update_passage(study_id: int, day_number: int, passage_id: int, body: PassageUpdate,
                  user: User = Depends(get_current_user),
                  session: Session = Depends(get_session)):
    _, d = _study_day(session, study_id, day_number, user)
    p = session.get(DayPassage, passage_id)
    if p is None or p.study_day_id != d.id:
        raise HTTPException(404, "passage not found")
    if body.translation is not None:
        if not session.exec(select(Translation).where(Translation.code == body.translation)).first():
            raise HTTPException(400, f"translation not loaded: {body.translation}")
        p.translation = body.translation
        p.text = _resolve_text(session, p.ref, body.translation)  # re-resolve in new version
    if body.order is not None:
        p.order = body.order
    if body.highlights is not None:
        p.highlights = body.highlights
    if body.rationale is not None:
        p.rationale = body.rationale
    if body.note is not None:
        # Store the user's reflection note anchored to the verse text.
        p.highlights = [{"text": p.text, "note": body.note}]
    session.add(p)
    session.commit()
    session.refresh(p)
    return _out(p)


@router.delete("/{study_id}/days/{day_number}/passages/{passage_id}")
def delete_passage(study_id: int, day_number: int, passage_id: int,
                   user: User = Depends(get_current_user),
                   session: Session = Depends(get_session)):
    _, d = _study_day(session, study_id, day_number, user)
    p = session.get(DayPassage, passage_id)
    if p is None or p.study_day_id != d.id:
        raise HTTPException(404, "passage not found")
    session.delete(p)
    session.commit()
    return {"ok": True}


def _out(p: DayPassage) -> PassageOut:
    return PassageOut(id=p.id, ref=p.ref, translation=p.translation, text=p.text,
                      order=p.order, rationale=p.rationale, highlights=p.highlights)
