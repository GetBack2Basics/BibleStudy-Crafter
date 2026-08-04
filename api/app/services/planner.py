"""Study planner: outline + day drafts.

Budget model (encodes the plan's wpm rule):
  reading words  = minutes * 130          (a 15-min day reads ~1,950 words)
  reflection      = minutes / 5 (round)   questions, min 3, max 6
  commentary      = the remainder of the words after scripture + prayer (~2/3)
The model only ever emits *references*; scripture text is resolved from the
local DB by services.bible_service so nothing is hallucinated.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.config.providers import get_registry
from app.services.bible_service import parse_ref, safe_parse_ref, Reference
from app.services.llm import LLMResult, NoProviderAvailable, complete

WPM = 130
QUESTION_MINUTES = 5
MIN_QUESTIONS = 3
MAX_QUESTIONS = 6
SUMMARY_WORD_CAP = 120


@dataclass
class Passage:
    ref: str
    rational: str = ""


@dataclass
class DayPlan:
    day_number: int
    title: str
    focus: str
    est_minutes: int
    suggested_passages: list[Passage]


@dataclass
class Outline:
    title: str
    summary: str
    days: list[DayPlan]


def budget(minutes_per_day: int) -> dict[str, int]:
    """Word/time budget for one day, derived from the wpm rule."""
    reading_words = int(minutes_per_day * WPM)
    questions = max(MIN_QUESTIONS,
                    min(MAX_QUESTIONS, round(minutes_per_day / QUESTION_MINUTES)))
    return {
        "reading_words": reading_words,
        "questions": questions,
        "commentary_words": int(reading_words * 0.66),
    }


OUTLINE_PROMPT = """You are planning a {total_days}-day Bible study on the topic
"{topic}". Each day should take about {minutes} minutes for the reader.

BUDGET (follow exactly):
- Reading: about {reading_words} words of Scripture per day.
- Commentary: about {commentary_words} words of your explanation per day.
- Reflection: {questions} open-ended questions per day.

For each day return:
- day_number (1..{total_days})
- title
- focus (one sentence on what that day covers)
- est_minutes (must be near {minutes})
- suggested_passages: a list of 1-4 passages, each with "ref" (a valid
  book chapter:verse reference, e.g. "John 3:16-18") and "rationale" (why it
  fits the day). Prefer a coherent reading arc across the days.

Return ONLY JSON matching this schema, no commentary:
{{
  "title": str,
  "summary": str,
  "days": [
    {{"day_number": int, "title": str, "focus": str, "est_minutes": int,
      "suggested_passages": [{{"ref": str, "rationale": str}}]}}
  ]
}}"""


async def generate_outline(topic: str, minutes_per_day: int, total_days: int,
                           *, tradition: str = None, session=None,
                           study_id: int | None = None) -> Outline:
    from app.services.prompts import build_system
    b = budget(minutes_per_day)
    prompt = OUTLINE_PROMPT.format(
        topic=topic, total_days=total_days, minutes=minutes_per_day,
        reading_words=b["reading_words"], commentary_words=b["commentary_words"],
        questions=b["questions"])
    try:
        res = await complete(prompt, system=build_system(tradition=tradition),
                             json_mode=True, session=session, study_id=study_id)
    except NoProviderAvailable:
        # Deterministic fallback so the app is usable with no provider at all.
        return _fallback_outline(topic, minutes_per_day, total_days)
    data = res.data
    days = [
        DayPlan(
            day_number=int(d["day_number"]),
            title=str(d.get("title", f"Day {d['day_number']}")),
            focus=str(d.get("focus", "")),
            est_minutes=int(d.get("est_minutes", minutes_per_day)),
            suggested_passages=[Passage(ref=str(p["ref"]),
                                        rational=str(p.get("rationale", "")))
                                for p in d.get("suggested_passages", [])],
        )
        for d in data.get("days", [])
    ]
    return Outline(title=str(data.get("title", topic)),
                   summary=str(data.get("summary", "")), days=days)


def _fallback_outline(topic: str, minutes: int, days: int) -> Outline:
    return Outline(
        title=topic, summary=f"A {days}-day study on {topic}.",
        days=[DayPlan(d, f"Day {d}", f"Reflections on {topic}", minutes, [])
              for d in range(1, days + 1)],
    )


# ----------------------------------------------------------- day draft

DAY_PROMPT = """Write day {day} of a Bible study titled "{title}".
Today's focus: {focus}

Passages to anchor the day (quote their references only - the app inserts the
actual text from its own Bible database; do NOT write out any verse yourself):
{passages}

{snippet}

Produce a JSON object with exactly these keys (no other text, no markdown):
{{
  "heading": str,
  "opening_prayer": str (1-2 sentences),
  "commentary": str (~{commentary_words} words, 2-4 short paragraphs),
  "questions": [str, str, str] (exactly {questions} reflection questions),
  "closing_prayer": str (1-2 sentences)
}}"""


async def generate_day(title: str, focus: str, passages: list[Passage],
                       minutes: int, day: int,
                       *, prior_summary: str | None = None,
                       tradition: str = None, session=None,
                       study_id: int | None = None) -> dict[str, Any]:
    """Draft one day. Returns a dict ready to store as blocks_json.

    The anti-hallucination guarantee: the LLM returns only references; we
    resolve each passage's text from the local DB and insert it into the
    scripture blocks. If a reference fails to parse, it is dropped.
    """
    from app.services.prompts import build_system
    b = budget(minutes)
    passage_block = "\n".join(f"- {p.ref}: {p.rational}" for p in passages) or "(none suggested)"
    snippet = (f"CONTEXT FROM PRIOR DAY (use only as continuity, do not repeat "
               f"its content):\n{prior_summary}") if prior_summary else ""

    prompt = DAY_PROMPT.format(
        day=day, title=title, focus=focus, passages=passage_block, snippet=snippet,
        commentary_words=b["commentary_words"], questions=b["questions"])

    try:
        res = await complete(prompt, system=build_system(tradition=tradition),
                             json_mode=True, session=session, study_id=study_id)
        data = res.data
    except NoProviderAvailable:
        data = {"heading": focus, "opening_prayer": "", "commentary": "",
                "questions": [], "closing_prayer": ""}

    # Resolve scripture text locally - never trust the model's verse wording.
    scripture_blocks = []
    for p in passages:
        ref = safe_parse_ref(p.ref)
        if ref is None:
            continue
        verses = _resolve(ref)
        scripture_blocks.append({
            "ref": ref.ref,
            "book": ref.book_name,
            "text": verses,
            "rationale": p.rational,
        })

    return {
        "heading": str(data.get("heading", focus)),
        "opening_prayer": str(data.get("opening_prayer", "")),
        "scripture": scripture_blocks,
        "commentary": str(data.get("commentary", "")),
        "questions": [str(q) for q in data.get("questions", [])],
        "closing_prayer": str(data.get("closing_prayer", "")),
    }


def _resolve(ref: Reference, translation: str = "KJV") -> str:
    """Pull verse text from the local DB. Returns '' on any miss."""
    from sqlmodel import Session, select
    from app.db import get_engine
    from app.models import Translation, Verse
    try:
        with Session(get_engine()) as s:
            tr = s.exec(select(Translation).where(
                Translation.code == translation)).first()
            if not tr:
                return ""
            rows = s.exec(
                select(Verse).where(
                    Verse.translation_id == tr.id,
                    Verse.book_number == ref.book,
                    Verse.chapter == ref.chapter,
                    Verse.verse >= ref.verse_start,
                    Verse.verse <= (ref.verse_end or ref.verse_start),
                ).order_by(Verse.verse)
            ).all()
            return " ".join(v.text for v in rows)
    except Exception:           # noqa: BLE001 - missing DB must not crash a draft
        return ""


def _corpus_passages(query: str, translation: str = "KJV", limit: int = 3) -> list[Passage]:
    """Lexical fallback: when the model suggests no passages, find real refs in
    the local corpus by searching verse text for salient topic words. Guarantees
    every day has scripture without depending on the model's JSON quality."""
    from sqlmodel import Session, select, or_
    from app.db import get_engine
    from app.models import Translation, Verse
    words = [w for w in query.lower().replace("'", "").split()
             if len(w) > 4 and w not in {
                 "study", "bible", "day", "reflections", "peace", "still",
                 "about", "their", "these", "those", "which", "would", "could"}]
    if not words:
        return []
    try:
        with Session(get_engine()) as s:
            tr = s.exec(select(Translation).where(
                Translation.code == translation)).first()
            if not tr:
                return []
            conds = [Verse.text.ilike(f"%{w}%") for w in words[:6]]
            rows = s.exec(
                select(Verse).where(Verse.translation_id == tr.id,
                                    or_(*conds))
                .order_by(Verse.book_number, Verse.chapter, Verse.verse)
                .limit(40)
            ).all()
            seen: set[tuple[int, int]] = set()
            out: list[Passage] = []
            for v in rows:
                key = (v.book_number, v.chapter)
                if key in seen:
                    continue
                seen.add(key)
                r = Reference(book=v.book_number, chapter=v.chapter,
                              verse_start=v.verse, verse_end=v.verse)
                out.append(Passage(ref=r.ref, rational=f"relevant to {query!r}"))
                if len(out) >= limit:
                    break
            return out
    except Exception:           # noqa: BLE001 - search miss must not crash
        return []


def make_summary(draft: dict[str, Any], prior: str | None = None) -> str:
    """Produce a <=120-word rolling summary of a day's content."""
    parts = [draft.get("heading", ""), draft.get("commentary", ""),
             " ".join(draft.get("questions", []))]
    text = " ".join(p for p in parts if p).strip()
    words = text.split()
    if len(words) <= SUMMARY_WORD_CAP:
        return text
    return " ".join(words[:SUMMARY_WORD_CAP]) + " …"
