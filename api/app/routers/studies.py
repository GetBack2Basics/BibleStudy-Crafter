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
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import get_current_user, get_current_user_optional
from app.config import get_settings
from app.db import get_engine, get_session
from app.models import Study, StudyDay, DayPassage, Asset, User
from app.services import events
from app.services import bible_service as bs
from app.services import geo_service
from app.services.llm import NoProviderAvailable
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

    events.emit("info", "study", f"Study {study_id} created: {body.topic}", study_id=study_id, day_number=1, progress=10, step="init")
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

            events.emit("info", "study", f"Study {study_id}: drafting outline…", study_id=study_id, day_number=1, progress=25, step="passages")
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
                        f"Study {study_id} outline ready ({len(outline.days)} days)", study_id=study_id, day_number=1, progress=50, step="scripture")
            events.emit("info", "study", f"Study {study_id}: writing day 1…", study_id=study_id, day_number=1, progress=65, step="commentary")
            await study_generate_day(study, 1, session=session,
                                     tradition=study.tradition,
                                     translation=study.primary_translation,
                                     custom_keys=custom_keys)
            study.status = "ready"
            session.commit()
            events.emit("success", "study", f"Study {study_id} day 1 generated", study_id=study_id, day_number=1, progress=100, step="complete")
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
        events.emit("info", "discussions", f"Study {study_id} day {day_number}: Discovering community perspectives & citations in background…", study_id=study_id, day_number=day_number)
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
def list_studies(user: Optional[User] = Depends(get_current_user_optional),
                session: Session = Depends(get_session)) -> list[StudyOut]:
    if user is not None:
        rows = session.exec(
            select(Study).where((Study.user_id == user.id) | (Study.user_id == None)).order_by(Study.id.desc())
        ).all()
    else:
        rows = session.exec(
            select(Study).where(Study.user_id == None).order_by(Study.id.desc())
        ).all()
    return [_to_out(s, session) for s in rows]


@router.get("/{study_id}")
def get_study(study_id: int, user: Optional[User] = Depends(get_current_user_optional),
             session: Session = Depends(get_session)) -> StudyOut:
    s = session.get(Study, study_id)
    if s is None:
        raise HTTPException(404, "study not found")
    if s.user_id is not None:
        if user is None or (s.user_id != user.id and not getattr(user, "is_admin", False)):
            raise HTTPException(404, "study not found")
    return _to_out(s, session)


@router.post("/reseed-demo")
def reseed_demo_endpoint(
    target_study_id: int = 8,
    session: Session = Depends(get_session),
    user: Optional[User] = Depends(get_current_user_optional),
) -> dict:
    """Purge and reseed the public demo study (Study 8) with all updated systems."""
    from app.seeder.demo_studies import reseed_study_8
    study = reseed_study_8(session, target_study_id=target_study_id)
    events.emit("success", "study", f"Demo Study {study.id} successfully purged and rebuilt with all updated systems.")
    return {
        "status": "ok",
        "study_id": study.id,
        "title": study.title,
        "days": len(study.days),
    }


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
    target = next((d for d in s.days if d.day_number == day_number), None)
    if target:
        target.status = "generating"
        session.add(target)
        session.commit()
    events.emit("info", "study", f"Study {study_id} day {day_number}: Initializing day generation…",
                study_id=study_id, day_number=day_number, progress=10, step="init")
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
                    study_id=study_id, day_number=day_number)
        raise HTTPException(
            status_code=402,
            detail="KEY_REQUIRED: AI generation requires an API key. Please add your free Gemini or OpenRouter key in your Profile."
        )
    except ValueError as exc:
        events.emit("error", "study", f"Study {study_id} day {day_number} failed: {exc}",
                    study_id=study_id, day_number=day_number)
        raise HTTPException(400, str(exc))
    # Best-effort real, cited discussions for the freshly generated day.
    asyncio.create_task(_build_discussions_safe(study_id, day_number))
    events.emit("success", "study", f"Study {study_id} day {day_number} ready",
                study_id=study_id, day_number=day_number, progress=100, step="complete")
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

    events.emit(
        "info",
        "discussions",
        f"Study {study_id} day {day_number}: Gathering community discussions and viewpoints…",
        study_id=study_id,
        day_number=day_number,
    )

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
    notes: dict[str, Any] | None = None


class ClosingPrayerRequest(BaseModel):
    notes: dict[str, Any] | None = None
    instruction: str | None = None


CLOSING_PRAYER_PROMPT = """You are crafting a deeply reverent, grounded, and personal CLOSING PRAYER of response to conclude this day's Bible study.

STUDY CONTEXT:
- Overall Study Topic: {study_topic}
- Theological Tradition: {tradition}
- Day {day_number}: {heading}
- Key Themes & Commentary:
{commentary_summary}

CHOSEN SCRIPTURE PASSAGES FOR TODAY:
{scripture_block}

USER'S PERSONAL STUDY NOTES & REFLECTIONS:
{user_notes_block}

COMMUNITY VOICES & PERSPECTIVES EXPLORED:
{voices_block}

{optional_user_instruction}

GUIDELINES FOR THE CLOSING PRAYER:
1. Grounded in Scripture: Draw deeply on today's scripture passages. Echo concrete words, imagery, and truths from the text.
2. Grounded in the Reader's Notes: Directly integrate and honor the reader's personal reflections, observations, and honest notes, acknowledging where they feel called to grow, rely on God, or obey.
3. Grounded in the Community Voices: Weave in the tensions, diverse insights, questions, or perspectives surfaced in the discussions section—transforming intellectual inquiry and diverse views into humble adoration, steadfast faith, and unity before God.
4. Voice & Tone: Write as an earnest, heartfelt prayer spoken directly to God ("Heavenly Father...", "Lord Jesus...", "Holy Spirit..."). Reverent, thoughtful, and personal.
5. Structure: 2 to 3 cohesive paragraphs separated by blank lines.
6. Clean Output: Do NOT include verse references or citations in brackets, do NOT include markdown headings or titles. Return ONLY the prayer text itself.
"""


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
                              user: User = Depends(get_current_user),
                              session: Session = Depends(get_session)) -> dict:
    """Revise a day's commentary or prayer with AI. If `selection` is given, only that
    passage is updated based on user prompt using existing text + page text context (CoverLetter-Crafter pattern)."""
    from app.services.llm import NoProviderAvailable, complete
    from app.services.prompts import build_system
    from app.routers.keys import get_user_keys
    from sqlmodel import select
    from app.models import DayPassage

    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    target = next((d for d in s.days if d.day_number == day_number), None)
    if target is None:
        raise HTTPException(400, "day out of range")

    user_keys = get_user_keys(session, user.id)
    custom_keys = user_keys if user_keys.get("use_custom_keys") else None

    field_key = body.target_field or "commentary"
    if field_key not in ("commentary", "opening_prayer", "closing_prayer"):
        field_key = "commentary"

    current_text = (target.blocks_json or {}).get(field_key, "") if target.blocks_json else ""
    if not current_text and not body.instruction and field_key != "closing_prayer":
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

    if field_key == "closing_prayer":
        notes_dict = {**(target.notes or {}), **(body.notes or {})}
        questions = blocks.get("questions") or []
        note_lines = []
        for k, v in notes_dict.items():
            if not v or not str(v).strip():
                continue
            v_str = str(v).strip()
            if k.startswith("question_"):
                try:
                    q_idx = int(k.split("_")[1])
                    q_label = questions[q_idx] if q_idx < len(questions) else f"Question {q_idx + 1}"
                    note_lines.append(f"Reflection on '{q_label}': \"{v_str}\"")
                except Exception:
                    note_lines.append(f"Question Note: \"{v_str}\"")
            elif k == "selah":
                note_lines.append(f"Selah Reflection: \"{v_str}\"")
            elif k == "discussions":
                note_lines.append(f"Voices Note: \"{v_str}\"")
            else:
                note_lines.append(f"Note ({k}): \"{v_str}\"")
        if note_lines:
            context_parts.append(f"- User Study Notes & Reflections: {'; '.join(note_lines)}")

        discussions = target.discussions_json or {}
        sources = discussions.get("sources") or []
        if sources:
            disc_summaries = [f"[{s.get('sentiment', 'perspective')}] {s.get('title')}: {s.get('snippet', '')[:80]}" for s in sources[:4]]
            context_parts.append(f"- Community Voices/Discussions: {'; '.join(disc_summaries)}")
        elif discussions.get("guide"):
            context_parts.append(f"- Discussions Topic: {discussions.get('topic', '')}")

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
                f"Revise and update that excerpt based on the user's instruction, reflection notes, and the scriptures.\n"
                f"2. Write in a reverent, thoughtful tone grounded in the scriptures and user reflections.\n"
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
        if field_key == "closing_prayer":
            specific_rules = (
                f"1. Craft or revise the complete {sec_title} grounded in today's scripture passages, the user's reflection notes, and community discussions above.\n"
                f"2. Write in a reverent, thoughtful tone spoken directly to God as a personal prayer of commitment (2-3 paragraphs).\n"
                f"3. Return the complete updated {sec_title}."
            )
        elif field_key == "opening_prayer":
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

    events.emit(
        "info",
        "study",
        f"Study {study_id} day {day_number}: Revising {sec_title} with AI wand…",
        study_id=study_id,
        day_number=day_number,
        step="revise",
    )

    try:
        res = await complete(prompt, system=build_system(tradition=s.tradition),
                             study_id=study_id, session=session, custom_keys=custom_keys)
    except NoProviderAvailable:
        events.emit("error", "llm", f"Study {study_id} day {day_number}: AI Provider unavailable - API key required", study_id=study_id, day_number=day_number)
        raise HTTPException(status_code=402, detail="KEY_REQUIRED: AI provider is unavailable or quota was exhausted. Please add your API key in Settings/Profile.")
    except Exception as exc:
        events.emit("error", "study", f"Study {study_id} day {day_number} revision failed: {exc}", study_id=study_id, day_number=day_number)
        raise HTTPException(status_code=500, detail=f"Revision failed: {exc}")
    
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
    events.emit(
        "success",
        "study",
        f"Study {study_id} day {day_number}: {sec_title} revised and saved",
        study_id=study_id,
        day_number=day_number,
        step="complete",
    )
    return {
        "day_number": day_number,
        "revised": final_text,
        "selection": body.selection,
        "target_field": field_key,
        "blocks_json": target.blocks_json,
    }


async def _generate_closing_prayer_for_day(
    study: Study,
    target: StudyDay,
    session: Session,
    custom_notes: dict[str, Any] | None = None,
    instruction: str | None = None,
    custom_keys: dict[str, str] | None = None,
) -> str:
    from app.services.llm import complete
    from app.services.prompts import build_system

    # 1. Scriptures
    passages = session.exec(
        select(DayPassage).where(DayPassage.study_day_id == target.id)
        .order_by(DayPassage.order)
    ).all()
    scripture_parts = []
    for p in passages:
        txt = (p.text or "").strip()
        scripture_parts.append(f"- {p.ref} ({p.translation}): {txt}")

    blocks = target.blocks_json or {}
    if not scripture_parts and blocks.get("scripture"):
        for s in blocks.get("scripture", []):
            if isinstance(s, dict):
                ref = s.get("ref", "")
                tr = s.get("translation", study.primary_translation or "KJV")
                t = s.get("text", "")
                scripture_parts.append(f"- {ref} ({tr}): {t}")

    scripture_block = "\n".join(scripture_parts) or "(Scripture readings for today)"

    heading = blocks.get("heading") or target.title or f"Day {target.day_number}"
    commentary = str(blocks.get("commentary") or "")
    comm_summary = (commentary[:600] + "...") if len(commentary) > 600 else commentary

    # 2. User notes
    notes_dict = {**(target.notes or {}), **(custom_notes or {})}
    questions = blocks.get("questions") or []
    note_lines = []
    for k, v in notes_dict.items():
        if not v or not str(v).strip():
            continue
        v_str = str(v).strip()
        if k.startswith("question_"):
            try:
                q_idx = int(k.split("_")[1])
                q_label = questions[q_idx] if q_idx < len(questions) else f"Question {q_idx + 1}"
                note_lines.append(f"- Reflection on '{q_label}': \"{v_str}\"")
            except Exception:
                note_lines.append(f"- Question Reflection: \"{v_str}\"")
        elif k == "selah":
            note_lines.append(f"- Daily Selah Reflection: \"{v_str}\"")
        elif k == "discussions":
            note_lines.append(f"- Journal note from Voices / Readings: \"{v_str}\"")
        elif k == "commentary":
            note_lines.append(f"- Commentary Note: \"{v_str}\"")
        else:
            note_lines.append(f"- Personal Note ({k}): \"{v_str}\"")

    user_notes_block = "\n".join(note_lines) if note_lines else "(No user notes recorded yet; ground in the study themes and scriptures)"

    # 3. Community Voices / Discussions
    discussions = target.discussions_json or {}
    disc_lines = []
    topic = discussions.get("topic") or target.theme or heading
    disc_lines.append(f"Topic: {topic}")
    sources = discussions.get("sources") or []
    for s in sources[:8]:
        title = s.get("title") or "Source"
        sentiment = s.get("sentiment") or "perspective"
        snippet = s.get("snippet") or ""
        disc_lines.append(f"- [{sentiment}] \"{title}\": {snippet}")
    if not sources and discussions.get("guide"):
        disc_lines.append(str(discussions["guide"])[:600])

    voices_block = "\n".join(disc_lines) if disc_lines else "(Community perspectives on these scriptures)"

    instruction_block = f"USER'S ADDITIONAL FOCUS/REQUEST:\n\"{instruction}\"" if instruction else ""
    prompt = CLOSING_PRAYER_PROMPT.format(
        study_topic=study.topic or study.title,
        tradition=study.tradition,
        day_number=target.day_number,
        heading=heading,
        commentary_summary=comm_summary,
        scripture_block=scripture_block,
        user_notes_block=user_notes_block,
        voices_block=voices_block,
        optional_user_instruction=instruction_block,
    )

    events.emit(
        "info",
        "study",
        f"Study {study.id} day {target.day_number}: Grounding closing prayer in community voices and reflection notes…",
        study_id=study.id,
        day_number=target.day_number,
        progress=50,
        step="prayer",
    )

    res = await complete(
        prompt,
        system=build_system(tradition=study.tradition),
        session=session,
        study_id=study.id,
        custom_keys=custom_keys,
    )
    return res.text.strip()


@router.post("/{study_id}/days/{day_number}/closing-prayer")
async def generate_closing_prayer_endpoint(
    study_id: int,
    day_number: int,
    body: ClosingPrayerRequest | None = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Generate or regenerate a closing prayer grounded in scripture, user notes, and discussions."""
    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    target = next((d for d in s.days if d.day_number == day_number), None)
    if target is None:
        raise HTTPException(400, "day out of range")

    from app.routers.keys import get_user_keys
    from app.services.llm import NoProviderAvailable

    user_keys = get_user_keys(session, user.id)
    custom_keys = user_keys if user_keys.get("use_custom_keys") else None

    custom_notes = body.notes if body else None
    instruction = body.instruction if body else None

    if custom_notes:
        target.notes = {**(target.notes or {}), **custom_notes}

    events.emit(
        "info",
        "study",
        f"Study {study_id} day {day_number}: Crafting personal closing prayer grounded in scripture & reflections…",
        study_id=study_id,
        day_number=day_number,
        progress=25,
        step="prayer",
    )

    try:
        prayer_text = await _generate_closing_prayer_for_day(
            s, target, session, custom_notes=custom_notes, instruction=instruction, custom_keys=custom_keys
        )
    except NoProviderAvailable as exc:
        events.emit(
            "error",
            "llm",
            f"Study {study_id} day {day_number} closing prayer failed: No text provider available. Please configure your API key in Settings.",
            study_id=study_id,
            day_number=day_number,
        )
        raise HTTPException(
            status_code=402,
            detail="KEY_REQUIRED: AI provider is unavailable or quota exhausted. Please check your API key in Settings/Profile.",
        )
    except Exception as exc:
        events.emit(
            "error",
            "study",
            f"Study {study_id} day {day_number} closing prayer failed: {exc}",
            study_id=study_id,
            day_number=day_number,
        )
        raise HTTPException(status_code=500, detail=f"Failed to generate closing prayer: {exc}")

    target.blocks_json = {**(target.blocks_json or {}), "closing_prayer": prayer_text}

    events.emit(
        "info",
        "study",
        f"Study {study_id} day {day_number}: Synchronizing scripture citations…",
        study_id=study_id,
        day_number=day_number,
        progress=85,
        step="scripture",
    )

    # Ensure scriptures section includes all verses mentioned
    text_sources = [
        target.blocks_json.get("commentary") or "",
        target.blocks_json.get("opening_prayer") or "",
        prayer_text,
        target.blocks_json.get("heading") or "",
        *[str(q) for q in target.blocks_json.get("questions", []) if str(q).strip()],
    ]
    scripture = target.blocks_json.get("scripture") or []
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
    events.emit(
        "success",
        "study",
        f"Study {study_id} day {day_number}: Closing prayer generated & saved",
        study_id=study_id,
        day_number=day_number,
        progress=100,
        step="complete",
    )
    return {
        "day_number": day_number,
        "closing_prayer": prayer_text,
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
    if target.status in ("pending", "generating"):
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


@router.post("/upgrade-all")
def upgrade_all_studies(session: Session = Depends(get_session)):
    """Migrate all existing studies to the new discussions, sentiment analysis, and multi-source format."""
    from app.db import upgrade_existing_studies
    upgrade_existing_studies()
    return {"status": "ok", "message": "All existing studies successfully upgraded to the new format."}


# ------------------------------------------------------------- Dual Biblical Maps
@router.get("/{study_id}/days/{day_number}/maps")
async def get_day_maps(
    study_id: int,
    day_number: int,
    session: Session = Depends(get_session)
):
    """Returns resolved historical and modern geographic maps for the study day."""
    s = session.get(Study, study_id)
    if not s:
        raise HTTPException(404, "Study not found")
    day = session.exec(
        select(StudyDay).where(StudyDay.study_id == study_id, StudyDay.day_number == day_number)
    ).first()
    if not day:
        raise HTTPException(404, "Day not found")

    blocks = day.blocks_json or {}
    passages = []
    if blocks.get("scripture"):
        for item in blocks.get("scripture", []):
            if isinstance(item, dict):
                passages.append(item)
    if not passages:
        db_passages = session.exec(
            select(DayPassage).where(DayPassage.study_day_id == day.id).order_by(DayPassage.order)
        ).all()
        for p in db_passages:
            passages.append({"ref": p.ref, "text": p.text, "translation": p.translation})

    commentary = str(blocks.get("commentary") or "")
    saved_maps = blocks.get("maps")

    # If already computed and cached in blocks_json, return it
    if saved_maps and isinstance(saved_maps, dict) and saved_maps.get("status") == "ready":
        return saved_maps

    # Otherwise resolve and persist
    resolved = geo_service.resolve_day_maps(commentary, passages)
    day.blocks_json = {**blocks, "maps": resolved}
    session.add(day)
    session.commit()
    session.refresh(day)
    return resolved


@router.post("/{study_id}/days/{day_number}/maps/refresh")
async def refresh_day_maps(
    study_id: int,
    day_number: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Forces re-extraction and generation of historical and modern map context."""
    s = session.get(Study, study_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Study not found")
    day = session.exec(
        select(StudyDay).where(StudyDay.study_id == study_id, StudyDay.day_number == day_number)
    ).first()
    if not day:
        raise HTTPException(404, "Day not found")

    events.emit(
        "info",
        "maps",
        f"Study {study_id} day {day_number}: Refreshing biblical geography & archaeological survey plates…",
        study_id=study_id,
        day_number=day_number,
    )

    blocks = day.blocks_json or {}
    passages = []
    if blocks.get("scripture"):
        for item in blocks.get("scripture", []):
            if isinstance(item, dict):
                passages.append(item)
    if not passages:
        db_passages = session.exec(
            select(DayPassage).where(DayPassage.study_day_id == day.id).order_by(DayPassage.order)
        ).all()
        for p in db_passages:
            passages.append({"ref": p.ref, "text": p.text, "translation": p.translation})

    commentary = str(blocks.get("commentary") or "")

    resolved = geo_service.resolve_day_maps(commentary, passages)

    # If external GCP engine is configured, attempt call
    gcp_engine_data = await geo_service.call_gcp_map_engine(
        resolved["locations"],
        resolved["period"]
    )
    if gcp_engine_data:
        resolved["gcp_engine"] = gcp_engine_data

    day.blocks_json = {**blocks, "maps": resolved}
    session.add(day)
    session.commit()
    session.refresh(day)

    events.emit(
        "success",
        "maps",
        f"Study {study_id} day {day_number}: Resolved {len(resolved.get('locations', []))} biblical sites and {len(resolved.get('historical_plates', []))} archaeological survey plates",
        study_id=study_id,
        day_number=day_number,
    )
    return resolved


class ParseMapTextIn(BaseModel):
    text: str
    mode: str = "preview"  # "preview" | "add"
    replace_all: bool = False


class AddMapLocationsIn(BaseModel):
    locations: list[dict[str, Any]]
    replace_all: bool = False


@router.post("/{study_id}/days/{day_number}/maps/parse-text")
async def parse_day_maps_text(
    study_id: int,
    day_number: int,
    body: ParseMapTextIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Parses arbitrary pasted text or scripture for biblical locations.

    If mode == 'preview', returns candidate locations for user review.
    If mode == 'add', merges into the day's map and saves to the database.
    """
    s = session.get(Study, study_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Study not found")
    day = session.exec(
        select(StudyDay).where(StudyDay.study_id == study_id, StudyDay.day_number == day_number)
    ).first()
    if not day:
        raise HTTPException(404, "Day not found")

    blocks = day.blocks_json or {}
    existing_maps = blocks.get("maps") or {}
    current_locations = existing_maps.get("locations", [])

    detected = geo_service.parse_locations_from_text(body.text, current_locations=current_locations)

    if body.mode == "add":
        updated_maps = geo_service.update_day_maps_with_locations(
            existing_maps,
            detected,
            replace_all=body.replace_all
        )
        day.blocks_json = {**blocks, "maps": updated_maps}
        session.add(day)
        session.commit()
        session.refresh(day)

        events.emit(
            "success",
            "maps",
            f"Study {study_id} day {day_number}: Parsed & added {len(detected)} biblical locations to map",
            study_id=study_id,
            day_number=day_number,
        )
        return updated_maps

    return {
        "status": "preview",
        "detected_count": len(detected),
        "locations": detected,
    }


@router.post("/{study_id}/days/{day_number}/maps/add-locations")
async def add_day_map_locations(
    study_id: int,
    day_number: int,
    body: AddMapLocationsIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Adds selected biblical locations to the current map and recalculates coordinates."""
    s = session.get(Study, study_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Study not found")
    day = session.exec(
        select(StudyDay).where(StudyDay.study_id == study_id, StudyDay.day_number == day_number)
    ).first()
    if not day:
        raise HTTPException(404, "Day not found")

    blocks = day.blocks_json or {}
    existing_maps = blocks.get("maps") or {}

    updated_maps = geo_service.update_day_maps_with_locations(
        existing_maps,
        body.locations,
        replace_all=body.replace_all
    )
    day.blocks_json = {**blocks, "maps": updated_maps}
    session.add(day)
    session.commit()
    session.refresh(day)

    events.emit(
        "success",
        "maps",
        f"Study {study_id} day {day_number}: Added {len(body.locations)} locations to map",
        study_id=study_id,
        day_number=day_number,
    )
    return updated_maps


