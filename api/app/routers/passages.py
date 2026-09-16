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
    source_reflections: list[dict] | None
    verse_notes: list[dict] | None


class SourceReflectionIn(BaseModel):
    text: str = ""
    note: str = ""
    source_url: str = ""
    source_title: str = ""


class VerseNoteIn(BaseModel):
    verse: int
    content: str = ""


class VerseNoteOut(BaseModel):
    verse: int
    notes: list[dict]  # [{id, content}]


def _verse_range(session: Session, ref: str) -> tuple[int, int, int] | None:
    """Parse a ref; return (book, chapter, verse) for a single verse, or
    (book, chapter, vstart) with vstart..vend for a range. Returns None on bad ref."""
    try:
        parsed = bs.parse_ref(ref)
    except ValueError:
        return None
    return (parsed.book, parsed.chapter, parsed.verse_start, parsed.verse_end)


def _ref_covers_verse(session: Session, passage: DayPassage, verse: int) -> bool:
    rng = _verse_range(session, passage.ref)
    if rng is None:
        return False
    _, _, vstart, vend = rng
    return vstart <= (verse or vstart) <= (vend or vstart)


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


@router.post("/{study_id}/days/{day_number}/passages/{passage_id}/source_reflection",
             response_model=PassageOut)
def attach_source_reflection(
        study_id: int, day_number: int, passage_id: int,
        body: SourceReflectionIn,
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
) -> PassageOut:
    _, d = _study_day(session, study_id, day_number, user)
    p = session.get(DayPassage, passage_id)
    if p is None or p.study_day_id != d.id:
        raise HTTPException(404, "passage not found")
    existing = p.source_reflections or []
    existing.append({
        "text": body.text,
        "note": body.note,
        "source_url": body.source_url,
        "source_title": body.source_title,
    })
    p.source_reflections = existing
    session.add(p)
    session.commit()
    session.refresh(p)
    return _out(p)


@router.delete("/{study_id}/days/{day_number}/passages/{passage_id}/source_reflections/{idx}")
def delete_source_reflection(
        study_id: int, day_number: int, passage_id: int, idx: int,
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
) -> dict:
    _, d = _study_day(session, study_id, day_number, user)
    p = session.get(DayPassage, passage_id)
    if p is None or p.study_day_id != d.id:
        raise HTTPException(404, "passage not found")
    existing = p.source_reflections or []
    if idx < 0 or idx >= len(existing):
        raise HTTPException(404, "source reflection not found")
    existing.pop(idx)
    p.source_reflections = existing or None
    session.add(p)
    session.commit()
    return {"ok": True}


@router.get("/{study_id}/days/{day_number}/passages/{passage_id}/verse_notes")
def list_verse_notes(
        study_id: int, day_number: int, passage_id: int,
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
) -> dict[int, list[dict]]:
    _, d = _study_day(session, study_id, day_number, user)
    p = session.get(DayPassage, passage_id)
    if p is None or p.study_day_id != d.id:
        raise HTTPException(404, "passage not found")
    return p.verse_notes or {}


@router.post("/{study_id}/days/{day_number}/passages/{passage_id}/verse_notes")
def upsert_verse_note(
        study_id: int, day_number: int, passage_id: int,
        body: VerseNoteIn,
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
) -> dict[int, list[dict]]:
    _, d = _study_day(session, study_id, day_number, user)
    p = session.get(DayPassage, passage_id)
    if p is None or p.study_day_id != d.id:
        raise HTTPException(404, "passage not found")
    existing = p.verse_notes or []
    bucket = next((b for b in existing if b.get("verse") == body.verse), None)
    if bucket is None:
        bucket = {"verse": body.verse, "notes": []}
        existing.append(bucket)
    note_id = f"{p.id}-{body.verse}-{len(bucket['notes'])}"
    bucket["notes"].append({"id": note_id, "content": body.content})
    p.verse_notes = existing
    session.add(p)
    session.commit()
    return {bucket["verse"]: bucket["notes"]}


@router.put("/{study_id}/days/{day_number}/passages/{passage_id}/verse_notes/{verse}/notes/{note_id}")
def update_verse_note(
        study_id: int, day_number: int, passage_id: int, verse: int, note_id: str,
        body: VerseNoteIn,
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
) -> dict[int, list[dict]]:
    _, d = _study_day(session, study_id, day_number, user)
    p = session.get(DayPassage, passage_id)
    if p is None or p.study_day_id != d.id:
        raise HTTPException(404, "passage not found")
    existing = p.verse_notes or []
    bucket = next((b for b in existing if b.get("verse") == verse), None)
    if bucket is None:
        raise HTTPException(404, "verse not found")
    note = next((n for n in bucket["notes"] if n.get("id") == note_id), None)
    if note is None:
        raise HTTPException(404, "note not found")
    note["content"] = body.content
    p.verse_notes = existing
    session.add(p)
    session.commit()
    return {verse: bucket["notes"]}


@router.delete("/{study_id}/days/{day_number}/passages/{passage_id}/verse_notes/{verse}/notes/{note_id}")
def delete_verse_note(
        study_id: int, day_number: int, passage_id: int, verse: int, note_id: str,
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
) -> dict[int, list[dict]]:
    _, d = _study_day(session, study_id, day_number, user)
    p = session.get(DayPassage, passage_id)
    if p is None or p.study_day_id != d.id:
        raise HTTPException(404, "passage not found")
    existing = p.verse_notes or []
    bucket = next((b for b in existing if b.get("verse") == verse), None)
    if bucket is None:
        raise HTTPException(404, "verse not found")
    bucket["notes"] = [n for n in bucket["notes"] if n.get("id") != note_id]
    if not bucket["notes"]:
        existing = [b for b in existing if b.get("verse") != verse]
    p.verse_notes = existing or None
    session.add(p)
    session.commit()
    return {verse: bucket["notes"]}


def _out(p: DayPassage) -> PassageOut:
    return PassageOut(id=p.id, ref=p.ref, translation=p.translation, text=p.text,
                      order=p.order, rationale=p.rationale, highlights=p.highlights,
                      source_reflections=p.source_reflections, verse_notes=p.verse_notes)
