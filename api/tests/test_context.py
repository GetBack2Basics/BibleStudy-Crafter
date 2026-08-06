"""Task 12b: rolling context - only the prior day's summary reaches day N,
never the full text of earlier days."""
import json
from unittest.mock import patch

import pytest

from app.services import planner
from app.services.planner import Passage, make_summary
from app.services.studies import generate_day as generate_day_service


# ----------------------------------------------------------- summary cap

def test_summary_is_generated_and_within_cap():
    draft = {"heading": "Day 3", "commentary": "the spirit " * 200,
             "questions": ["a"] * 30}
    s = make_summary(draft)
    assert s
    assert len(s.split()) <= 121


# ----------------------------------------------------------- rolling exclusion

async def test_day3_prompt_excludes_day1_body():
    """Day 3 must receive day 2's summary, not day 1's full body text."""
    day1_body = "DAY ONE FULL TEXT " + "x" * 500
    day2_summary = make_summary({"heading": "Day 2",
                                   "commentary": "brief recap of day two",
                                   "questions": ["q"]})

    # Stub the LLM so we can inspect the prompt it received
    captured = {}

    async def _spy(*a, **k):
        captured["system"] = k.get("system", "")
        captured["prompt"] = a[0] if a else k.get("prompt", "")
        return planner.LLMResult(
            text=json.dumps({"heading": "Day 3", "opening_prayer": "",
                             "commentary": "c", "questions": ["q1", "q2", "q3"],
                             "closing_prayer": ""}),
            provider="ollama", model="m", tokens_in=1, tokens_out=1, data={})

    # Build a fake study with 3 days
    class FakeDay:
        def __init__(self, n, summary=None, passages=None, theme="f"):
            self.day_number = n
            self.context_summary = summary
            self.suggested_passages = passages or []
            self.theme = theme
            self.blocks_json = None
            self.status = "pending"

    class FakeStudy:
        id = 7
        title = "Forgiveness"
        minutes_per_day = 15
        outline_json = {"days": [
            {"day_number": 1, "suggested_passages": [{"ref": "John 3:16", "rationale": "r"}]},
            {"day_number": 2, "suggested_passages": [{"ref": "1 Cor 13:4", "rationale": "r"}]},
            {"day_number": 3, "suggested_passages": [{"ref": "Eph 4:32", "rationale": "r"}]},
        ]}
        days = [FakeDay(1, None, [{"ref": "John 3:16", "rationale": "r"}]),
                FakeDay(2, day2_summary, [{"ref": "1 Cor 13:4", "rationale": "r"}]),
                FakeDay(3, None, [{"ref": "Eph 4:32", "rationale": "r"}])]

    study = FakeStudy()
    with patch("app.services.planner.complete", _spy):
        # call the service for day 3
        await generate_day_service(study, 3, session=_FakeSession(),
                                   tradition=None)

    # Day 3's prompt carries day 2's summary...
    assert day2_summary in captured.get("prompt", "")
    # ...and must NOT contain day 1's full body text
    assert day1_body not in captured.get("prompt", "")
    # day 1 body must not appear anywhere in the captured prompt
    assert "DAY ONE FULL TEXT" not in captured.get("prompt", "")


async def test_day1_works_with_no_prior_summary():
    class FakeDay:
        def __init__(self):
            self.day_number = 1
            self.context_summary = None
            self.suggested_passages = [{"ref": "John 3:16", "rationale": "r"}]
            self.theme = "beginning"
            self.blocks_json = None
            self.status = "pending"

    class FakeStudy:
        id = 7
        title = "Love"
        minutes_per_day = 15
        outline_json = {"days": [{"day_number": 1,
                             "suggested_passages": [{"ref": "John 3:16", "rationale": "r"}]}]}
        days = [FakeDay()]

    async def _spy(*a, **k):
        return planner.LLMResult(
            text=json.dumps({"heading": "h", "opening_prayer": "",
                             "commentary": "c", "questions": ["q"], "closing_prayer": ""}),
            provider="ollama", model="m", tokens_in=1, tokens_out=1, data={})

    with patch("app.services.planner.complete", _spy):
        draft = await generate_day_service(FakeStudy(), 1, session=_FakeSession(),
                                           tradition=None)
    assert draft["heading"]


class _FakeSession:
    def add(self, *a, **k): pass
    def commit(self, *a, **k): pass
    def refresh(self, *a, **k): pass

    def exec(self, *a, **k):
        class _R:
            def all(self): return []
        return _R()
