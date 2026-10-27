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
import re
from dataclasses import dataclass
from typing import Any

from app.config.providers import get_registry
from app.services import events
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
  book chapter:verse reference, e.g. "John 3:16-18") and "rationale".

  RATIONALE RULE (important — do not skip):
  * The rationale must be a SINGLE, SPECIFIC sentence explaining what THIS
    particular verse reveals about the day's focus. Draw it from the content
    of the verse itself, not the topic in general.
  * It must be UNIQUE to this passage — never "relevant to the topic",
    "fits the theme", or any phrase that repeats across passages or days.
  * Two different verses must never receive the same rationale.
  Prefer a coherent reading arc across the days.

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
                           study_id: int | None = None,
                           custom_keys: dict[str, str] | None = None) -> Outline:
    from app.services.prompts import build_system
    b = budget(minutes_per_day)
    prompt = OUTLINE_PROMPT.format(
        topic=topic, total_days=total_days, minutes=minutes_per_day,
        reading_words=b["reading_words"], commentary_words=b["commentary_words"],
        questions=b["questions"])
    res = await complete(prompt, system=build_system(tradition=tradition),
                         json_mode=True, session=session, study_id=study_id,
                         custom_keys=custom_keys)
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

SCRIPTURE TEXT FOR TODAY - every passage below is provided for you; DO NOT write
out any verse yourself - speak from the text that is given:
{passages}

AMALGAMATED READING FOR TODAY - EVERY PASSAGE, IN SEVERAL VERSIONS
(the same verses rendered in different translations - the PRIMARY version is
listed first in each block. The prayers must be built from this whole block,
not from one passage and not from one version):
{amalgam_block}

{prev_block}

{snippet}

Produce a JSON object with exactly these keys (no other text, no markdown):
{{
  "heading": str,
  "opening_prayer": str (2-3 sentences. GROUND it in the day's scripture above:
      it must draw on EVERY passage listed for today, not just the first -
      let the day's readings speak together as one prayer. Echo short, real
      phrases (a few words each) taken from AT LEAST TWO DIFFERENT VERSIONS in
      the amalgamated block, so the wording of more than one translation is
      audible. Do NOT name the versions and do NOT cite references inside the
      prayer, and do not reproduce a whole verse - weave the borrowed phrases
      into what the reader wants to say to God about what these verses reveal.
      Stay inside what the Scripture actually says; do not import outside claims.),
  "commentary": str (~{commentary_words} words, 2-4 distinct paragraphs separated
      by blank lines (\\n\\n); explain the passage plainly, honest about difficulty.
      Format for high readability: use **bold** for key theological concepts, terms, and
      themes, and *italics* for Bible verse citations and direct scripture quotes),
  "questions": [str, str, str] (exactly {questions} reflection questions),
  "closing_prayer": str (leave empty string ""; closing prayer is generated on demand at the conclusion of the study by the reader, grounded in their notes and discussions)
}}"""


# ---------------------------------------------------- multi-version amalgamation
# The prayers are grounded in the day's WHOLE reading, heard in more than one
# translation. We resolve every passage in the study's primary version plus
# alternates that are actually loaded in the corpus, rotating the alternates per
# passage so a day's readings don't all arrive in the same two voices.
PRAYER_VERSION_COUNT = 2


def _loaded_translations() -> list[str]:
    """Translation codes actually present in the local corpus (stable order)."""
    from sqlmodel import Session, select
    from app.db import get_engine
    from app.models import Translation
    try:
        with Session(get_engine()) as s:
            return [t.code for t in s.exec(
                select(Translation).order_by(Translation.code)).all()]
    except Exception:           # noqa: BLE001 - missing DB must not crash a draft
        return []


def _resolve_many(ref: Reference, translations: list[str], session=None) -> dict[str, str]:
    """{code: text} for one reference across several versions."""
    from app.services.bible_service import resolve_ref_text
    out: dict[str, str] = {}
    for code in translations:
        try:
            txt = resolve_ref_text(ref, code, session=session)
            if txt:
                out[code] = txt
        except Exception:
            pass
    return out


def version_mix(primary: str, available: list[str],
                count: int = PRAYER_VERSION_COUNT, offset: int = 0) -> list[str]:
    """`primary` first, then alternates rotated by `offset`.

    Rotating per passage means passage 1 might be heard in KJV/WEB/BSB while
    passage 2 is heard in KJV/BSB/YLT - a genuine mix across the day's reading
    rather than the same pair repeated.
    """
    primary = (primary or "KJV").upper()
    alts = [c for c in available if c.upper() != primary]
    if not alts:
        return [primary]
    if offset:
        offset %= len(alts)
        alts = alts[offset:] + alts[:offset]
    return [primary] + alts[:max(0, count - 1)]


def _amalgamate(scripture_blocks: list[dict], primary: str,
                available: list[str], session=None) -> tuple[str, list[str]]:
    """Render every passage of the day in a mix of versions.

    Returns (prompt_block, version_codes_used).
    """
    if not scripture_blocks:
        return "(no passages for this day)", []
    lines: list[str] = []
    used: list[str] = []
    for i, blk in enumerate(scripture_blocks):
        ref = safe_parse_ref(blk.get("ref", ""))
        if ref is None:
            continue
        codes = version_mix(primary, available, offset=i)
        texts = _resolve_many(ref, codes, session=session)
        if not texts:
            continue
        lines.append(blk["ref"])
        for code, text in texts.items():
            if not text:
                continue
            lines.append(f"  [{code}] {text}")
            if code not in used:
                used.append(code)
    if not lines:
        return "(no passages for this day)", []
    return "\n".join(lines), used


async def generate_day(title: str, focus: str, passages: list[Passage],
                       minutes: int, day: int,
                       *, prior_summary: str | None = None,
                       prev_scripture: str | None = None,
                       tradition: str = None, session=None,
                       study_id: int | None = None,
                       translation: str = "KJV",
                       custom_keys: dict[str, str] | None = None) -> dict[str, Any]:
    """Draft one day. Returns a dict ready to store as blocks_json.

    The anti-hallucination guarantee: the LLM returns only references; we
    resolve each passage's text from the local DB and insert it into the
    scripture blocks. If a reference fails to parse, it is dropped.

    Prayers are grounded in the day's own scripture (and, if supplied,
    the previous day's scripture) so they stay inside the text.
    """
    from app.services.prompts import build_system
    b = budget(minutes)
    passage_block = "\n".join(f"- {p.ref}: {p.rational}" for p in passages) or "(none suggested)"

    if study_id is not None:
        events.emit(
            "info", "study",
            f"Day {day}: Resolving {translation} scripture texts & translations…",
            study_id=study_id, day_number=day, progress=35, step="scripture",
        )

    # Resolve scripture text locally so the model can ground the prayers in it.
    scripture_blocks = []
    for p in passages:
        ref = safe_parse_ref(p.ref)
        if ref is None:
            continue
        verses = _resolve(ref, translation, session=session)
        scripture_blocks.append({
            "ref": ref.ref,
            "book": ref.book_name,
            "text": verses,
            "rationale": p.rational,
        })
    scripture_block = "\n".join(
        f"{s['ref']} ({translation}): {s['text']}" for s in scripture_blocks
    ) or "(no passages for this day)"

    # Amalgamated, multi-version rendering of the WHOLE day's reading. This is
    # what the prayers are grounded in, so they gather every passage and echo
    # more than one translation instead of paraphrasing the first verse only.
    available = _loaded_translations()
    if not available:
        available = [translation, "WEB", "KJV"]
    amalgam_block, versions_used = _amalgamate(
        scripture_blocks, translation, available, session=session)

    prev_block = ""
    if prev_scripture and prev_scripture.strip():
        prev_block = ("PREVIOUS DAY'S SCRIPTURE (draw on it only if today's passage "
                      "needs its context; do not repeat it):\n" + prev_scripture.strip())

    snippet = (f"CONTEXT FROM PRIOR DAY (use only as continuity, do not repeat "
               f"its content):\n{prior_summary}") if prior_summary else ""

    prompt = DAY_PROMPT.format(
        day=day, title=title, focus=focus, passages=passage_block,
        amalgam_block=amalgam_block,
        prev_block=prev_block, snippet=snippet,
        commentary_words=b["commentary_words"], questions=b["questions"])

    if study_id is not None:
        events.emit(
            "info", "study",
            f"Day {day}: Drafting theological commentary, reflections & prayers…",
            study_id=study_id, day_number=day, progress=65, step="commentary",
        )

    res = await complete(prompt, system=build_system(tradition=tradition),
                         json_mode=True, session=session, study_id=study_id,
                         custom_keys=custom_keys)
    data = res.data or {}
    if not data and res.text:
        try:
            import json
            parsed = json.loads(res.text)
            if isinstance(parsed, (dict, list)):
                data = parsed
        except Exception:
            pass

    # Robust unwrapping of model response in case wrapped in an outer object
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
        data = data[0]
    elif isinstance(data, dict):
        for wrap_key in ("day", f"day_{day}", f"day{day}", "study_day", "draft", "result", "response", "content", "study"):
            if wrap_key in data and isinstance(data[wrap_key], dict):
                data = data[wrap_key]
                break
        else:
            if not any(k in data for k in ("commentary", "theological_commentary", "questions")):
                for v in data.values():
                    if isinstance(v, dict) and any(k in v for k in ("commentary", "theological_commentary", "questions")):
                        data = v
                        break
    if not isinstance(data, dict):
        data = {}

    def _clean(value: Any, default: str = "") -> str:
        text = str(value or "").strip()
        return text or default

    raw_heading = data.get("heading") or data.get("title") or data.get("day_title") or focus
    raw_opening = (
        data.get("opening_prayer")
        or data.get("openingPrayer")
        or data.get("prayer")
        or data.get("prayer_opening")
        or data.get("invocation")
    )
    raw_commentary = (
        data.get("commentary")
        or data.get("theological_commentary")
        or data.get("theologicalCommentary")
        or data.get("commentary_text")
        or data.get("commentaryText")
        or data.get("reflection")
        or data.get("exposition")
        or data.get("study_notes")
        or data.get("explanation")
        or data.get("body")
        or data.get("content")
    )
    if isinstance(raw_commentary, list):
        raw_commentary = "\n\n".join(str(p).strip() for p in raw_commentary if str(p).strip())
    elif isinstance(raw_commentary, dict):
        raw_commentary = "\n\n".join(str(v).strip() for v in raw_commentary.values() if str(v).strip())

    raw_questions = (
        data.get("questions")
        or data.get("reflection_questions")
        or data.get("reflectionQuestions")
        or data.get("study_questions")
        or data.get("discussion_questions")
        or data.get("questions_for_reflection")
        or data.get("prompts")
    )
    questions_list: list[str] = []
    if isinstance(raw_questions, list):
        for q in raw_questions:
            if isinstance(q, dict):
                q_text = q.get("question") or q.get("prompt") or q.get("text") or str(q)
                if str(q_text).strip():
                    questions_list.append(str(q_text).strip())
            elif str(q).strip():
                questions_list.append(str(q).strip())
    elif isinstance(raw_questions, str) and raw_questions.strip():
        for line in raw_questions.splitlines():
            cleaned = re.sub(r"^\s*(?:\d+[\.\)]|\-|\*)\s*", "", line).strip()
            if cleaned:
                questions_list.append(cleaned)
    elif isinstance(raw_questions, dict):
        for v in raw_questions.values():
            if str(v).strip():
                questions_list.append(str(v).strip())

    raw_closing = (
        data.get("closing_prayer")
        or data.get("closingPrayer")
        or data.get("benediction")
    )

    # Targeted synthesis fallback if commentary or questions came back empty
    if not str(raw_commentary or "").strip() and scripture_block and scripture_block != "(no passages for this day)":
        try:
            sec_prompt = (
                f"Write an inspiring theological commentary (~350 words, 2-3 distinct paragraphs separated by blank lines) "
                f"for Day {day} of '{title}' focusing on '{focus}'.\n"
                f"Scripture reading:\n{scripture_block}\n"
                f"Explain the theological and historical meaning clearly with bold for key concepts and italics for quotes. Return ONLY the commentary paragraphs."
            )
            comm_res = await complete(sec_prompt, system=build_system(tradition=tradition),
                                      session=session, study_id=study_id, custom_keys=custom_keys)
            if comm_res and comm_res.text.strip():
                raw_commentary = comm_res.text.strip()
        except Exception:
            pass

    if not questions_list and scripture_block and scripture_block != "(no passages for this day)":
        try:
            q_prompt = (
                f"Write 3 deep, personal reflection questions for Day {day} of '{title}' focusing on '{focus}'.\n"
                f"Scripture reading:\n{scripture_block}\n"
                f"Return as a JSON array of 3 string questions: [\"question 1\", \"question 2\", \"question 3\"]"
            )
            q_res = await complete(q_prompt, system=build_system(tradition=tradition),
                                   json_mode=True, session=session, study_id=study_id, custom_keys=custom_keys)
            q_data = q_res.data
            if isinstance(q_data, list):
                questions_list = [str(x).strip() for x in q_data if str(x).strip()]
            elif isinstance(q_data, dict):
                for val in q_data.values():
                    if isinstance(val, list):
                        questions_list = [str(x).strip() for x in val if str(x).strip()]
                        break
        except Exception:
            pass

    # The Scriptures section must include all verses mentioned in other sections
    # such as commentary, opening prayer, closing prayer, questions, and heading.
    text_sources = [
        _clean(raw_opening),
        _clean(raw_commentary),
        _clean(raw_closing),
        _clean(raw_heading),
        *questions_list,
    ]
    from app.services.bible_service import ensure_scriptures_include_mentioned
    scripture_blocks = ensure_scriptures_include_mentioned(
        scripture_blocks, text_sources, translation=translation, session=session
    )

    return {
        "heading": _clean(raw_heading, focus),
        "opening_prayer": _clean(raw_opening),
        "scripture": scripture_blocks,
        "commentary": _clean(raw_commentary),
        "questions": questions_list,
        "closing_prayer": _clean(raw_closing),
        # Provenance: which versions the day's prayers were amalgamated from.
        "prayer_versions": versions_used,
    }


def _resolve(ref: Reference, translation: str = "KJV", session=None) -> str:
    """Pull verse text using bible_service with on-demand fallback. Returns '' on any miss."""
    from app.services.bible_service import resolve_ref_text
    try:
        return resolve_ref_text(ref, translation, session=session)
    except Exception:
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
                # No LLM available: anchor the rationale to the actual verse
                # reference (unique per passage) rather than repeating the
                # topic string across every verse.
                out.append(Passage(ref=r.ref,
                                   rational=f"{r.ref} — read in the light of '{query}'."))
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


# ----------------------------------------------------------- passage planning

PASSAGE_PROMPT = """You are selecting Bible passages for ONE day of a study.

Study topic: "{topic}"
This day's focus: {focus}
Use the {translation} translation when suggesting references.
Suggest {count} passages (1-4), each a valid "Book chapter:verse" or
"Book chapter:verse-verse" reference that genuinely speaks to THIS day's focus.

Return ONLY JSON (no prose, no markdown):
{{
  "passages": [
    {{"ref": "Matthew 11:28-30",
      "rationale": "Jesus invites the weary to take His yoke - the literal hinge of the day's theme."}}
  ]
}}

RATIONALE RULE (critical):
* Each rationale is ONE specific sentence explaining what THAT verse reveals
  about the day's focus, drawn from the verse's own content.
* Every rationale must be UNIQUE - never repeat a phrase across passages, and
  never write "relevant to the topic" or "fits the theme".
* Two different verses must never get the same rationale."""


async def plan_passages(topic: str, focus: str, count: int = 3,
                        translation: str = "KJV", *,
                        session=None, study_id: int | None = None,
                        custom_keys: dict[str, str] | None = None) -> list[Passage]:
    """Focused, single-purpose passage pick the weak free-tier models can
    reliably fulfil (the full outline prompt often drops the passages array).

    Returns real refs with unique, verse-specific rationales. Falls back to the
    corpus lexical miner if the model is unavailable or returns nothing.
    """
    from app.services.prompts import build_system
    prompt = PASSAGE_PROMPT.format(
        topic=topic, focus=focus, count=count, translation=translation)
    try:
        res = await complete(prompt, system=build_system(),
                             json_mode=True, session=session, study_id=study_id,
                             custom_keys=custom_keys)
        data = res.data
        out = [
            Passage(ref=str(p.get("ref", "")).strip(),
                    rational=str(p.get("rationale", "")).strip())
            for p in data.get("passages", [])
            if str(p.get("ref", "")).strip()
        ]
        # De-duplicate refs, keep first rationale per ref.
        seen: dict[str, Passage] = {}
        for p in out:
            if p.ref not in seen:
                seen[p.ref] = p
        out = list(seen.values())
        if out:
            return out
    except NoProviderAvailable:
        pass
    # Model gave nothing usable -> lexical corpus fallback (ref-specific rationale).
    return _corpus_passages(focus or topic, translation, limit=count)
