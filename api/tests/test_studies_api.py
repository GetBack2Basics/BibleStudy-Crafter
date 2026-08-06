"""Task 13: /api/studies create -> 202, poll, day-1 eager generation.

Runs against an in-memory SQLite DB with the LLM stubbed (no keys needed).
The `client` fixture lives in conftest.py.
"""
import json
from unittest.mock import patch

import pytest
from sqlmodel import Session


async def _smart_stub(*a, **k):
    """Return OUTLINE for the outline call, DAY for a day-draft call."""
    from app.services.llm import LLMResult
    prompt = a[0] if a else k.get("prompt", "")
    payload = DAY if "Write day" in prompt else OUTLINE
    return LLMResult(text=json.dumps(payload), provider="ollama", model="m",
                     tokens_in=1, tokens_out=1, data=payload)


OUTLINE = {
    "title": "Forgiveness", "summary": "A study on forgiving as we are forgiven.",
    "days": [{"day_number": i, "title": f"Day {i}", "focus": f"focus {i}",
              "est_minutes": 15,
              "suggested_passages": [{"ref": "Matt 6:14-15", "rationale": "r"}]}
             for i in range(1, 8)],
}
DAY = {"heading": "Forgiving others", "opening_prayer": "p", "commentary": "c",
       "questions": ["q1", "q2", "q3"], "closing_prayer": "cp"}


def test_create_returns_202_and_poll_eventually_ready(client):
    with patch("app.services.planner.complete", _smart_stub):
        r = client.post("/api/studies", json={"topic": "Forgiveness",
                                              "minutes_per_day": 15,
                                              "total_days": 7})
        assert r.status_code == 202
        body = r.json()
        assert body["status"] == "generating"
        sid = body["study_id"]

        # background task runs inside the still-active patch
        import time
        for _ in range(50):
            got = client.get(f"/api/studies/{sid}").json()
            if got["status"] in ("ready", "failed"):
                break
            time.sleep(0.1)

    assert got["status"] == "ready", got
    assert len(got["days"]) == 7
    # day 1 eagerly generated -> has content
    assert got["days"][0]["status"] == "ready"
    assert got["days"][0]["blocks_json"]
    assert "Forgiving others" == got["days"][0]["blocks_json"]["heading"]
    # scripture resolved from the local corpus
    assert got["days"][0]["blocks_json"]["scripture"]


def test_on_demand_day_generation(client):
    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "Peace", "total_days": 3,
                                "minutes_per_day": 15}).json()["study_id"]
    import time
    for _ in range(50):
        if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
            break
        time.sleep(0.1)

    with patch("app.services.planner.complete", _smart_stub):
        r = client.post(f"/api/studies/{sid}/days/2", json={})
    assert r.status_code == 200
    assert r.json()["status"] == "ready"
    assert "commentary" in r.json()["draft"]


def test_inline_edit_persists_blocks_json(client):
    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "Edit me", "total_days": 2,
                                "minutes_per_day": 15}).json()["study_id"]
    import time
    for _ in range(50):
        if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
            break
        time.sleep(0.1)

    edited = {"heading": "My rewrite", "opening_prayer": "Lord, help.",
              "scripture": [], "commentary": "Edited commentary.",
              "questions": ["Q one", "Q two"], "closing_prayer": "Amen."}
    r = client.put(f"/api/studies/{sid}/days/1", json={"blocks_json": edited})
    assert r.status_code == 200
    # PUT returns the updated day
    assert r.json()["blocks_json"]["commentary"] == "Edited commentary."
    assert r.json()["blocks_json"]["questions"] == ["Q one", "Q two"]

    # persisted on reload
    got = client.get(f"/api/studies/{sid}").json()
    assert got["days"][0]["blocks_json"]["heading"] == "My rewrite"
    assert got["days"][0]["status"] == "ready"


def test_revise_day_with_selection(client):
    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "Revise me", "total_days": 1,
                                "minutes_per_day": 15}).json()["study_id"]
        import time
        for _ in range(50):
            if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
                break
            time.sleep(0.1)
    # generation done with stub; day 1 now has commentary to revise
    assert client.get(f"/api/studies/{sid}").json()["days"][0]["blocks_json"]["commentary"]

    # revise the whole commentary
    r = client.post(f"/api/studies/{sid}/days/1/revise",
                    json={"instruction": "Make it warmer", "selection": None})
    assert r.status_code == 200
    assert "revised" in r.json()
    assert len(r.json()["revised"]) > 0

    # revise only a selected passage
    r2 = client.post(f"/api/studies/{sid}/days/1/revise",
                     json={"instruction": "shorten", "selection": "the Lord's authority"})
    assert r2.status_code == 200
    assert r2.json()["selection"] == "the Lord's authority"


def test_revise_grounds_on_chosen_passages(client):
    """Regression: revise prompt must include the day's DayPassage refs+text."""
    captured = {}

    async def _spy(*a, **k):
        from app.services.llm import LLMResult
        captured["prompt"] = a[0] if a else ""
        payload = {"heading": "H", "opening_prayer": "p", "commentary": "c",
                   "questions": ["q"], "closing_prayer": "cp"}
        return LLMResult(text="revised commentary", provider="ollama",
                         model="m", tokens_in=1, tokens_out=1, data=payload)

    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "Grounding", "total_days": 1,
                                "minutes_per_day": 15}).json()["study_id"]
        import time
        for _ in range(50):
            if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
                break
            time.sleep(0.1)
    passages = client.get(f"/api/studies/{sid}/days/1/passages").json()
    assert passages, "day must have passages to ground on"

    with patch("app.services.llm.complete", _spy):
        r = client.post(f"/api/studies/{sid}/days/1/revise",
                        json={"instruction": "Tie it to the verses", "selection": None})
    assert r.status_code == 200
    prompt = captured.get("prompt", "")
    # every chosen passage ref must appear in the revise prompt
    for p in passages:
        assert p["ref"] in prompt, f"revise prompt missing passage {p['ref']}"
    # and the revised text is persisted back to blocks_json
    saved = client.get(f"/api/studies/{sid}").json()["days"][0]["blocks_json"]["commentary"]
    assert saved == "revised commentary"
