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
from sqlmodel import Session, select

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_engine, get_session
from app.models import Study, StudyDay, DayPassage, Asset, User
from app.services import events
from app.services import bible_service as bs
from app.services.studies import generate_day as study_generate_day
from app.services.studies import build_day_discussions

router = APIRouter(prefix="/api/studies", tags=["studies"])

def _extract_bible_refs(text: str) -> list[str]:
    """Find Bible references cited in text like 'John 3:16', '1 Cor 13:4-8'."""
    return [r.ref for r in bs.extract_bible_refs(text)]


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
    discussions: dict[str, Any] | None = None
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


def _enrich_day_blocks(session: Session | None, s: Study, d: StudyDay) -> dict | None:
    if not d.blocks_json:
        return None
    blocks = dict(d.blocks_json)
    if "scripture" in blocks and isinstance(blocks["scripture"], list):
        enriched_scripture = []
        for item in blocks["scripture"]:
            if isinstance(item, dict):
                ref = item.get("ref", "")
                text = item.get("text", "")
                tr = (item.get("translation") or s.primary_translation or "KJV").upper()
                if not text and ref:
                    try:
                        parsed = bs.parse_ref(ref)
                        if parsed:
                            if session:
                                rows = bs.get_passage(session, parsed, tr)
                            else:
                                with Session(get_engine()) as sess:
                                    rows = bs.get_passage(sess, parsed, tr)
                            text = " ".join(v["text"] for v in rows)
                    except Exception:
                        pass
                item_copy = dict(item)
                item_copy["text"] = text
                item_copy["translation"] = tr
                enriched_scripture.append(item_copy)
            else:
                enriched_scripture.append(item)
        blocks["scripture"] = enriched_scripture
    return blocks


def _to_out(s: Study, session: Session | None = None) -> StudyOut:
    return StudyOut(
        id=s.id, topic=s.topic, title=s.title or "",
        minutes_per_day=s.minutes_per_day, total_days=s.total_days,
        tradition=s.tradition, imagery_policy=s.imagery_policy,
        primary_translation=s.primary_translation, status=s.status,
        verse_pool=s.verse_pool, outline_json=s.outline_json,
        history_json=s.history_json,
        days=[DayOut(day_number=d.day_number, title=d.title, theme=d.theme,
                     status=d.status, context_summary=d.context_summary,
                     notes=d.notes, discussions=d.discussions_json,
                     blocks_json=_enrich_day_blocks(session, s, d)) for d in s.days],
    )



@router.post("", status_code=202)
async def create_study(body: StudyCreate,
                       user: User = Depends(get_current_user),
                       session: Session = Depends(get_session)) -> dict[str, Any]:
    settings = get_settings()
    s = Study(
        topic=body.topic, minutes_per_day=body.minutes_per_day,
        total_days=body.total_days,
        tradition=body.tradition or settings.default_tradition,
        imagery_policy=body.imagery_policy or settings.default_imagery_policy,
        primary_translation=body.primary_translation,
        verse_pool=body.selected_refs,
        status="generating",
        user_id=user.id,
    )
    session.add(s)
    s.days = [StudyDay(day_number=n, status="pending")
              for n in range(1, body.total_days + 1)]
    session.commit()
    session.refresh(s)
    study_id = s.id

    events.emit("info", "study", f"Study {study_id} created: {body.topic}", study_id=study_id, progress=5)
    asyncio.create_task(_build_outline_and_day1(study_id, body, user_id=user.id))
    return {"study_id": study_id, "status": "generating"}


async def _build_outline_and_day1(study_id: int, body: StudyCreate, user_id: int) -> None:
    with Session(get_engine()) as session:
        study = session.get(Study, study_id)
        if study is None:
            return
        if study.user_id != user_id:       # ownership guard
            return
        try:
            from app.services.planner import generate_outline
            from app.routers.keys import get_user_keys
            user_keys = get_user_keys(session, user_id)
            custom_keys = user_keys if user_keys.get("use_custom_keys") else None

            events.emit("info", "study", f"Study {study_id}: drafting outline…", study_id=study_id, progress=25)
            outline = await generate_outline(
                body.topic, body.minutes_per_day, body.total_days,
                tradition=study.tradition, session=session, study_id=study_id,
                custom_keys=custom_keys)
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
                                     translation=study.primary_translation,
                                     custom_keys=custom_keys)
            study.status = "ready"
            session.commit()
            events.emit("success", "study", f"Study {study_id} day 1 generated", study_id=study_id, progress=100)
            # Best-effort: gather real, cited discussions for day 1 in the background.
            asyncio.create_task(
                _build_discussions_safe(study_id, 1))
        except NoProviderAvailable as exc:
            study.status = "failed"
            session.commit()
            events.emit("error", "llm", "AI Provider unavailable - API key required. Please enter your Gemini or OpenRouter key in Settings.", study_id=study_id)
        except Exception as exc:           # noqa: BLE001 - background job
            study.status = "failed"
            session.commit()
            events.emit("error", "study",
                        f"Study {study_id} failed: {type(exc).__name__}: {exc}")
            raise


async def _build_discussions_safe(study_id: int, day_number: int) -> None:
    """Fetch real, cited discussions for a day without disturbing its status."""
    from sqlmodel import select
    from app.services.studies import build_day_discussions
    try:
        with Session(get_engine()) as session:
            study = session.get(Study, study_id)
            if study is None:
                return
            await build_day_discussions(study, day_number, session=session,
                                        study_id=study_id)
    except Exception as exc:           # noqa: BLE001 - discussions are best-effort
        events.emit("warn", "study",
                    f"discussions for study {study_id} day {day_number} failed: {exc}")


@router.get("")
def list_studies(user: User = Depends(get_current_user),
                session: Session = Depends(get_session)) -> list[StudyOut]:
    rows = session.exec(
        select(Study).where(Study.user_id == user.id).order_by(Study.id.desc())
    ).all()
    return [_to_out(s, session) for s in rows]


@router.get("/{study_id}")
def get_study(study_id: int, user: User = Depends(get_current_user),
             session: Session = Depends(get_session)) -> StudyOut:
    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    return _to_out(s, session)


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
def delete_all_studies(user: User = Depends(get_current_user),
                       session: Session = Depends(get_session)) -> dict:
    """Delete ALL of *this user's* studies (days, passages, assets) but keep the
    Bible corpus. Registered before /{study_id} so '_all' is not parsed as an id.
    """
    studies = session.exec(
        select(Study).where(Study.user_id == user.id)
    ).all()
    count = len(studies)
    for s in studies:
        _delete_study_data(session, s)
    events.emit("success", "study", f"All {count} of your studies deleted")
    return {"deleted": count}


@router.delete("/{study_id}")
def delete_study(study_id: int, user: User = Depends(get_current_user),
                session: Session = Depends(get_session)) -> dict:
    """Delete a single study (its days, passages, assets). Bible corpus is preserved."""
    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    _delete_study_data(session, s)
    events.emit("success", "study", f"Study {study_id} deleted")
    return {"deleted": study_id}


@router.post("/{study_id}/days/{day_number}")
async def generate_day_endpoint(study_id: int, day_number: int,
                                user: User = Depends(get_current_user),
                                session: Session = Depends(get_session)) -> dict:
    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    if day_number < 1 or day_number > s.total_days:
        raise HTTPException(400, "day out of range")
    events.emit("info", "study", f"Study {study_id} day {day_number}: regenerating…",
                study_id=study_id, progress=75)
    try:
        from app.routers.keys import get_user_keys
        from app.services.llm import NoProviderAvailable
        user_keys = get_user_keys(session, user.id)
        custom_keys = user_keys if user_keys.get("use_custom_keys") else None

        draft = await study_generate_day(s, day_number, session=session,
                                         tradition=s.tradition,
                                         translation=s.primary_translation,
                                         custom_keys=custom_keys)
    except NoProviderAvailable as exc:
        events.emit("error", "llm", "AI Provider unavailable - API key required",
                    study_id=study_id)
        raise HTTPException(
            status_code=402,
            detail="KEY_REQUIRED: AI generation requires an API key. Please add your free Gemini or OpenRouter key in your Profile."
        )
    except ValueError as exc:
        events.emit("error", "study", f"Study {study_id} day {day_number} failed: {exc}",
                    study_id=study_id)
        raise HTTPException(400, str(exc))
    # Best-effort real, cited discussions for the freshly generated day.
    asyncio.create_task(_build_discussions_safe(study_id, day_number))
    events.emit("success", "study", f"Study {study_id} day {day_number} regenerated",
                study_id=study_id, progress=100)
    return {"day_number": day_number, "status": "ready", "draft": draft}


class DiscussionsRequest(BaseModel):
    negative_count: int = Field(4, ge=0, le=20)
    neutral_count: int = Field(2, ge=0, le=20)
    positive_count: int = Field(2, ge=0, le=20)


@router.post("/{study_id}/days/{day_number}/discussions")
async def regenerate_discussions(study_id: int, day_number: int,
                                 req: DiscussionsRequest | None = None,
                                 user: User = Depends(get_current_user),
                                 session: Session = Depends(get_session)) -> dict:
    """(Re)fetch real, cited discussion material for a day's verses."""
    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    if day_number < 1 or day_number > s.total_days:
        raise HTTPException(400, "day out of range")
    
    neg = req.negative_count if req else 4
    neu = req.neutral_count if req else 2
    pos = req.positive_count if req else 2

    result = await build_day_discussions(
        s, day_number, session=session,
        study_id=study_id,
        negative_count=neg,
        neutral_count=neu,
        positive_count=pos)
    if result is None:
        raise HTTPException(400, "day has no verses or topic to discuss")
    return {"day_number": day_number, "discussions": result}



class DayUpdate(BaseModel):
    blocks_json: dict[str, Any]
    notes: dict[str, Any] | None = None   # user notes on commentary/prayers sections


class DayRevise(BaseModel):
    instruction: str
    selection: str | None = None
    target_field: str | None = "commentary"


REVISE_PROMPT = """You are helping a user revise the {section_title} of a Bible study.

STUDY CONTEXT:
- Overall Topic: {study_topic}
- Theological Tradition: {tradition}
- Day {day_number}: {day_heading}

CHOSEN SCRIPTURE PASSAGES FOR TODAY:
{scripture}

PAGE CONTENT CONTEXT:
{page_context}

CURRENT {section_title_upper} TEXT:
---
{current_text}
---

{selection_block}
USER REFINEMENT INSTRUCTION:
"{instruction}"

CRITICAL INSTRUCTIONS:
{specific_rules}
Return ONLY the revised text with no markdown code fences, no preamble, and no conversational meta-commentary about what was changed.
"""

SCRIPTURE_BLOCK = "- {ref} ({translation}): {text}"


@router.post("/{study_id}/days/{day_number}/revise")
async def revise_day_endpoint(study_id: int, day_number: int, body: DayRevise,
                              session: Session = Depends(get_session)) -> dict:
    """Revise a day's commentary or prayer with AI. If `selection` is given, only that
    passage is updated based on user prompt using existing text + page text context (CoverLetter-Crafter pattern)."""
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

    field_key = body.target_field or "commentary"
    if field_key not in ("commentary", "opening_prayer", "closing_prayer"):
        field_key = "commentary"

    current_text = (target.blocks_json or {}).get(field_key, "") if target.blocks_json else ""
    if not current_text and not body.instruction:
        raise HTTPException(400, f"day has no {field_key} to revise yet")

    # Ground the revision on the day's chosen scripture passages.
    passages = session.exec(
        select(DayPassage).where(DayPassage.study_day_id == target.id)
        .order_by(DayPassage.order)
    ).all()
    scripture_block = "\n".join(
        SCRIPTURE_BLOCK.format(ref=p.ref, translation=p.translation, text=p.text)
        for p in passages
    ) or "(no passages selected for this day)"

    blocks = target.blocks_json or {}
    context_parts = []
    if blocks.get("heading"):
        context_parts.append(f"- Day Heading: {blocks.get('heading')}")
    if field_key != "opening_prayer" and blocks.get("opening_prayer"):
        context_parts.append(f"- Opening Prayer: {blocks.get('opening_prayer')}")
    if field_key != "commentary" and blocks.get("commentary"):
        comm_prev = str(blocks.get('commentary'))[:300] + ("..." if len(str(blocks.get('commentary'))) > 300 else "")
        context_parts.append(f"- Commentary Context: {comm_prev}")
    if blocks.get("questions"):
        context_parts.append(f"- Reflection Questions: {', '.join(str(q) for q in blocks.get('questions', []))}")
    if field_key != "closing_prayer" and blocks.get("closing_prayer"):
        context_parts.append(f"- Closing Prayer: {blocks.get('closing_prayer')}")
    
    page_context = "\n".join(context_parts) if context_parts else "(Day content being crafted)"

    section_titles = {
        "commentary": "Commentary",
        "opening_prayer": "Opening Prayer",
        "closing_prayer": "Closing Prayer"
    }
    sec_title = section_titles.get(field_key, "Commentary")

    if body.selection:
        selection_block = (
            f"TARGET EXCERPT SELECTED BY USER TO UPDATE:\n"
            f"---\n{body.selection}\n---\n"
        )
        if field_key in ("opening_prayer", "closing_prayer"):
            specific_rules = (
                f"1. The user has highlighted the specific excerpt above from the {sec_title}. "
                f"Revise and update that excerpt based on the user's instruction and the scriptures.\n"
                f"2. Write in a reverent, thoughtful tone grounded in the scriptures.\n"
                f"3. Return the revised excerpt that replaces the highlighted portion (or the complete updated prayer with the revision incorporated seamlessly)."
            )
        else:
            specific_rules = (
                f"1. The user has highlighted the specific excerpt above from the {sec_title}. "
                f"Revise and update that excerpt based on the user's instruction, using the whole commentary and scriptures as context.\n"
                f"2. Maintain readable formatting with distinct paragraphs (separated by blank lines), **bold** key terms, and *italics* for Bible verses and scripture citations.\n"
                f"3. Return the revised text that replaces the highlighted portion (or the complete updated commentary with the revision incorporated seamlessly)."
            )
    else:
        selection_block = "The user has requested a revision of the entire section."
        if field_key in ("opening_prayer", "closing_prayer"):
            specific_rules = (
                f"1. Rewrite and improve the entire {sec_title} according to the user's instruction and the scriptures above.\n"
                f"2. Write in a reverent, thoughtful tone grounded in the scriptures.\n"
                f"3. Return the complete updated {sec_title}."
            )
        else:
            specific_rules = (
                f"1. Rewrite and improve the entire {sec_title} according to the user's instruction and the scriptures above.\n"
                f"2. Maintain readable formatting with distinct paragraphs (separated by blank lines), **bold** key terms, and *italics* for Bible verses and scripture citations.\n"
                f"3. Return the complete updated {sec_title}."
            )

    prompt = REVISE_PROMPT.format(
        section_title=sec_title,
        section_title_upper=sec_title.upper(),
        study_topic=s.title or s.topic,
        tradition=s.tradition or "Universal Christian",
        day_number=day_number,
        day_heading=blocks.get("heading") or target.title or f"Day {day_number}",
        scripture=scripture_block,
        page_context=page_context,
        current_text=current_text or "(none)",
        selection_block=selection_block,
        instruction=body.instruction,
        specific_rules=specific_rules
    )

    try:
        res = await complete(prompt, system=build_system(tradition=s.tradition),
                             study_id=study_id, session=session)
    except NoProviderAvailable:
        events.emit("error", "llm", "AI Provider unavailable - API key required", study_id=study_id)
        raise HTTPException(status_code=402, detail="KEY_REQUIRED: AI provider is unavailable or quota was exhausted. Please add your API key in Settings/Profile.")
    
    revised_piece = res.text.strip()
    # Strip accidental wrapping quotes or markdown fences if returned
    if revised_piece.startswith("```") and revised_piece.endswith("```"):
        lines = revised_piece.splitlines()
        if len(lines) >= 2:
            revised_piece = "\n".join(lines[1:-1]).strip()

    if body.selection and current_text:
        if body.selection in revised_piece:
            # Model returned full text containing the revision
            final_text = revised_piece
        elif len(revised_piece) < len(current_text) * 0.75 and body.selection in current_text:
            # Model returned only the updated replacement for the selected excerpt
            final_text = current_text.replace(body.selection, revised_piece, 1)
        else:
            final_text = revised_piece
    else:
        final_text = revised_piece

    target.blocks_json = {**(target.blocks_json or {}), field_key: final_text}
    
    # Ensure scriptures section includes all verses mentioned in other sections
    text_sources = [
        target.blocks_json.get("commentary") or "",
        target.blocks_json.get("opening_prayer") or "",
        target.blocks_json.get("closing_prayer") or "",
        target.blocks_json.get("heading") or "",
        *[str(q) for q in target.blocks_json.get("questions", []) if str(q).strip()],
    ]
    scripture = target.blocks_json.get("scripture") or []
    if not scripture and getattr(target, "id", None) is not None:
        existing_dps = session.exec(
            select(DayPassage).where(DayPassage.study_day_id == target.id)
            .order_by(DayPassage.order)
        ).all()
        scripture = [
            {"ref": p.ref, "translation": p.translation, "text": p.text, "rationale": p.rationale}
            for p in existing_dps
        ]
    tr = s.primary_translation or "KJV"
    updated_scripture = bs.ensure_scriptures_include_mentioned(
        scripture, text_sources, translation=tr, session=session
    )
    target.blocks_json["scripture"] = updated_scripture
    if getattr(target, "id", None) is not None:
        from app.services.studies import _sync_passages
        _sync_passages(session, target, updated_scripture, tr)

    session.add(target)
    session.commit()
    events.emit("success", "study", f"Study {study_id} day {day_number} {field_key} revised")
    return {
        "day_number": day_number,
        "revised": final_text,
        "selection": body.selection,
        "target_field": field_key,
        "blocks_json": target.blocks_json,
    }


@router.put("/{study_id}/days/{day_number}")
def update_day_endpoint(study_id: int, day_number: int, body: DayUpdate,
                        session: Session = Depends(get_session)) -> dict:
    """Persist user edits to a day's blocks_json (inline editing).

    The scriptures section includes all verses mentioned across the other
    sections such as commentary and prayers, auto-resolving any newly cited
    verses.
    """
    from app.services.planner import make_summary

    s = session.get(Study, study_id)
    if s is None:
        raise HTTPException(404, "study not found")
    target = next((d for d in s.days if d.day_number == day_number), None)
    if target is None:
        raise HTTPException(400, "day out of range")

    # --- Auto-include all mentioned scriptures in the Scriptures section ---
    blocks = body.blocks_json or {}
    text_sources = [
        blocks.get("commentary") or "",
        blocks.get("opening_prayer") or "",
        blocks.get("closing_prayer") or "",
        blocks.get("heading") or "",
        *[str(q) for q in blocks.get("questions", []) if str(q).strip()],
    ]
    if body.notes:
        text_sources.extend(str(v) for v in body.notes.values() if v)

    scripture = blocks.get("scripture") or []
    if not scripture and getattr(target, "id", None) is not None:
        existing_dps = session.exec(
            select(DayPassage).where(DayPassage.study_day_id == target.id)
            .order_by(DayPassage.order)
        ).all()
        scripture = [
            {"ref": p.ref, "translation": p.translation, "text": p.text, "rationale": p.rationale}
            for p in existing_dps
        ]

    tr = s.primary_translation or "KJV"
    updated_scripture = bs.ensure_scriptures_include_mentioned(
        scripture, text_sources, translation=tr, session=session
    )
    blocks["scripture"] = updated_scripture
    body.blocks_json = blocks

    target.blocks_json = body.blocks_json
    if body.notes is not None:
        target.notes = body.notes
    if target.status == "pending":
        target.status = "ready"
    target.context_summary = make_summary(body.blocks_json, target.context_summary)
    
    if getattr(target, "id", None) is not None:
        from app.services.studies import _sync_passages
        _sync_passages(session, target, updated_scripture, tr)

    session.add(target)
    session.commit()
    session.refresh(target)
    events.emit("info", "study", f"Study {study_id} day {day_number} edited")
    return _to_out(s).model_dump()["days"][day_number - 1]


# ---------------------------------------------------------------- verse curation for a day

class VerseSuggestionOut(BaseModel):
    ref: str
    snippet: str          # ~75-word snippet from the loaded translation
    search_hit: bool       # True => came from corpus search, not a canned suggestion


class PassageReplaceIn(BaseModel):
    passages: list[dict]   # [{ref, translation?}]  (rationale optional)


@router.get("/{study_id}/days/{day_number}/verse_suggestions")
def verse_suggestions_endpoint(
        study_id: int, day_number: int,
        q: str | None = None,
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
) -> list[VerseSuggestionOut]:
    """Return candidate verses for a day: the day's existing passages plus, when
    `q` is given, corpus search hits ranked by relevance. Each hit carries a
    ~75-word snippet from the loaded translation so the user can judge it before
    picking it."""
    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    target = next((d for d in s.days if d.day_number == day_number), None)
    if target is None:
        raise HTTPException(400, "day out of range")

    out: list[VerseSuggestionOut] = []
    seen: set[str] = set()

    def _add(ref: str, snippet: str, from_search: bool) -> None:
        key = ref.split()[0].upper() + "|" + ref
        if key in seen:
            return
        seen.add(key)
        out.append(VerseSuggestionOut(ref=ref, snippet=snippet, search_hit=from_search))

    # Existing day passages (already chosen) — show first so the user sees what's
    # currently there and can keep or replace them.
    for p in (target.passages or []):
        if getattr(p, "ref", None):
            _add(p.ref, _verse_snippet(session, p.ref, s.primary_translation), from_search=False)

    # Corpus search hits when a query is supplied.
    if q and q.strip():
        try:
            hits = bs.search(q.strip(), s.primary_translation, limit=12)
        except Exception:
            hits = []
        for h in hits:
            _add(f"{h.book} {h.chapter}:{h.verse}", _truncate_words(h.text, 75), from_search=True)

    return out


@router.put("/{study_id}/days/{day_number}/passages")
async def replace_day_passages(
        study_id: int, day_number: int,
        body: PassageReplaceIn,
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
) -> dict:
    """Replace a day's first-class passages with the user's selection (from the
    verse-suggestions picker or typed in by hand), then regenerate the day's
    commentary/notes around the new passages."""
    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    target = next((d for d in s.days if d.day_number == day_number), None)
    if target is None:
        raise HTTPException(400, "day out of range")

    # Validate every ref resolves + text is available in the chosen (or primary) translation.
    resolved: list[dict] = []
    for item in body.passages:
        ref_raw = (item.get("ref") or "").strip()
        if not ref_raw:
            continue
        tr = (item.get("translation") or s.primary_translation).upper()
        try:
            parsed = bs.parse_ref(ref_raw)
        except ValueError:
            raise HTTPException(400, f"cannot parse reference: {ref_raw}")
        try:
            verses = bs.get_passage(session, parsed, tr)
        except LookupError as exc:
            raise HTTPException(400, str(exc))
        if not verses:
            raise HTTPException(400, f"no text for {ref_raw} in {tr}")
        resolved.append({
            "ref": ref_raw,
            "translation": tr,
            "text": " ".join(v["text"] for v in verses),
            "rationale": (item.get("rationale") or "").strip(),
        })

    # Persist as first-class DayPassage rows (replace whatever was there).
    if getattr(target, "id", None) is not None:
        from app.models import DayPassage
        session.exec(
            DayPassage.__table__.delete().where(DayPassage.study_day_id == target.id)
        ).execution_options(synchronize_session=False)
        order = 0
        for rp in resolved:
            dp = DayPassage(
                study_day_id=target.id, ref=rp["ref"], translation=rp["translation"],
                text=rp["text"], order=order, rationale=rp["rationale"],
                highlights=None, source_reflections=None, verse_notes=None,
            )
            session.add(dp)
            order += 1
        target.blocks_json = {**(target.blocks_json or {}), "scripture": [
            {"ref": r["ref"], "translation": r["translation"], "text": r["text"], "rationale": r["rationale"]}
            for r in resolved
        ]}
        session.commit()
        session.refresh(target)

    # Regenerate the day's commentary/notes around the new passages.
    try:
        draft = await study_generate_day(s, day_number, session=session,
                                         tradition=s.tradition, translation=s.primary_translation)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    asyncio.create_task(_build_discussions_safe(study_id, day_number))
    return {"day_number": day_number, "status": "ready", "draft": draft}


def _verse_snippet(session: Session, ref: str, translation: str) -> str:
    """First ~75 words of a verse's text in the given translation, for the
    verse-suggestion list."""
    try:
        parsed = bs.parse_ref(ref)
    except ValueError:
        return ""
    try:
        rows = bs.get_passage(session, parsed, translation)
    except LookupError:
        return ""
    text = " ".join(v["text"] for v in rows)
    return _truncate_words(text, 75) if text else ""



def _truncate_words(text: str, n: int) -> str:
    words = text.split()
    if len(words) <= n:
        return text
    return " ".join(words[:n]) + "…"
