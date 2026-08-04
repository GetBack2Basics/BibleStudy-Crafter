"""Tasks 11 & 12: planner budget arithmetic, day count, and the anti-hallucination
guarantee (scripture text always comes from the DB, never the model)."""
import json
from unittest.mock import patch

import pytest

from app.services import planner
from app.services.planner import (
    DAY_PROMPT,
    OUTLINE_PROMPT,
    Passage, budget, generate_day, generate_outline, make_summary,
)


# ----------------------------------------------------------- budget arithmetic

def test_budget_matches_wpm_rule():
    b = budget(15)
    assert b["reading_words"] == 1950          # 15 * 130
    assert b["commentary_words"] == int(1950 * 0.66)
    assert b["questions"] == 3                 # round(15/5)

    b30 = budget(30)
    assert b30["reading_words"] == 3900
    assert b30["questions"] == 6                # capped at MAX_QUESTIONS


# ----------------------------------------------------------- outline

def _stub_complete(payload: dict):
    async def _complete(*a, **k):
        from app.services.llm import LLMResult
        return LLMResult(text=json.dumps(payload), provider="ollama",
                         model="m", tokens_in=1, tokens_out=1, data=payload)
    return _complete


async def test_outline_day_count_matches_request():
    payload = {
        "title": "Forgiveness", "summary": "x",
        "days": [{"day_number": i, "title": f"D{i}", "focus": "f",
                  "est_minutes": 15,
                  "suggested_passages": [{"ref": "Matt 6:14-15", "rationale": "r"}]}
                 for i in range(1, 8)],
    }
    with patch("app.services.planner.complete", _stub_complete(payload)):
        out = await generate_outline("Forgiveness", 15, 7)
    assert len(out.days) == 7
    assert out.days[0].day_number == 1
    assert out.days[-1].day_number == 7
    assert out.days[0].suggested_passages[0].ref == "Matt 6:14-15"


async def test_est_minutes_within_20pct():
    payload = {
        "title": "Peace", "summary": "x",
        "days": [{"day_number": i, "title": f"D{i}", "focus": "f",
                  "est_minutes": 9 if i % 2 else 20,
                  "suggested_passages": []} for i in range(1, 6)],
    }

    captured = {}

    async def _capture(*a, **k):
        captured["prompt"] = k.get("prompt", a[0] if a else "")
        return await _stub_complete(payload)(*a, **k)

    with patch("app.services.planner.complete", _capture):
        out = await generate_outline("Peace", 15, 5)
    # the wpm rule produced ~1950 reading words and was asked for 3 questions
    assert "1950" in captured["prompt"]
    assert "3" in captured["prompt"]
    assert len(out.days) == 5


async def test_outline_falls_back_without_provider():
    from app.services.llm import NoProviderAvailable
    async def _boom(*a, **k):
        raise NoProviderAvailable("none")
    with patch("app.services.planner.complete", _boom):
        out = await generate_outline("Hope", 15, 5)
    assert len(out.days) == 5
    assert out.title == "Hope"


# ----------------------------------------------------------- anti-hallucination

async def test_scripture_block_text_comes_from_db():
    """The model returns a WRONG verse text; the stored block must use DB text."""
    # LLM returns a bogus 'John 3:16' wording
    bogus = {
        "heading": "For God", "opening_prayer": "p", "commentary": "c",
        "questions": ["q1", "q2", "q3"], "closing_prayer": "cp",
    }
    with patch("app.services.planner.complete", _stub_complete(bogus)):
        draft = await generate_day(
            title="Love", focus="f",
            passages=[Passage(ref="John 3:16", rational="why")],
            minutes=15, day=1, study_id=None, session=None)

    assert draft["scripture"], "expected a resolved scripture block"
    # The real KJV text, not the model's (absent) wording
    assert "For God so loved the world" in draft["scripture"][0]["text"]
    assert draft["scripture"][0]["ref"] == "John 3:16"
    # model never supplied verse text, so block text is purely from DB
    assert bogus["commentary"] in draft["commentary"]


async def test_unparseable_reference_is_dropped():
    with patch("app.services.planner.complete", _stub_complete(
            {"heading": "h", "opening_prayer": "", "commentary": "c",
             "questions": ["q"], "closing_prayer": ""})):
        draft = await generate_day(
            title="t", focus="f",
            passages=[Passage(ref="not a real ref !!", rational="r")],
            minutes=15, day=1)
    assert draft["scripture"] == []


# ----------------------------------------------------------- rolling summary

def test_summary_is_within_word_cap():
    long = {"heading": "Day", "commentary": "word " * 500,
             "questions": ["q"] * 50}
    s = make_summary(long)
    assert len(s.split()) <= 121     # 120 words + ellipsis marker


def test_summary_excludes_prior_text_when_none():
    s = make_summary({"heading": "h", "commentary": "only today", "questions": []})
    assert "only today" in s
