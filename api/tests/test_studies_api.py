"""Task 13: /api/studies create -> 202, poll, day-1 eager generation.

Runs against an in-memory SQLite DB with the LLM stubbed (no keys needed).
The `client` fixture lives in conftest.py.
"""
import json
import time
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


def _make_ready_study(client):
    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "To delete", "total_days": 1,
                                "minutes_per_day": 15}).json()["study_id"]
        import time
        for _ in range(50):
            if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
                break
            time.sleep(0.1)
    return sid


def test_delete_single_study_removes_days_and_passages(client):
    sid = _make_ready_study(client)
    assert len(client.get(f"/api/studies/{sid}/days/1/passages").json()) >= 1
    r = client.delete(f"/api/studies/{sid}")
    assert r.status_code == 200
    assert client.get(f"/api/studies/{sid}").status_code == 404
    # nothing else should remain for that study
    assert client.get("/api/studies").json() == []


def test_delete_all_studies_keeps_bible_corpus(client):
    s1 = _make_ready_study(client)
    s2 = _make_ready_study(client)
    r = client.delete("/api/studies/_all")
    assert r.status_code == 200
    assert r.json()["deleted"] == 2
    assert client.get("/api/studies").json() == []
    # Bible tables untouched
    n_trans = _count(client, "translation")
    n_verse = _count(client, "verse")
    assert n_trans >= 1, "Bible translations must survive a study wipe"
    assert n_verse >= 1, "Verses must survive a study wipe"


def _count(client, table):
    """Count rows in a table via the running app's engine (corpus tables only)."""
    from app.db import get_engine
    from sqlalchemy import text
    eng = get_engine()
    with eng.connect() as c:
        return c.execute(text(f"SELECT count(*) FROM {table}")).scalar()


def test_compressed_history_uses_all_prior_days(client):
    """Day 3 must receive day 1 AND day 2 in its context (cumulative, compressed)."""
    from app.services.studies import get_compressed_history

    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "Arc", "total_days": 3,
                                "minutes_per_day": 15}).json()["study_id"]
        for _ in range(50):
            if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
                break
            time.sleep(0.1)
    with patch("app.services.planner.complete", _smart_stub):
        client.post(f"/api/studies/{sid}/days/2", json={})
        client.post(f"/api/studies/{sid}/days/3", json={})
    # wait for on-demand days 2 & 3 to finish (background tasks)
    for _ in range(80):
        days = client.get(f"/api/studies/{sid}").json()["days"]
        if all(d["status"] == "ready" for d in days):
            break
        time.sleep(0.1)
    study = client.get(f"/api/studies/{sid}").json()
    compressed = get_compressed_history(study.get("history_json") or {})
    # Day 3 must have received BOTH earlier days (cumulative context).
    assert "Day 1" in compressed, "history should contain day 1"
    assert "Day 2" in compressed, "history should contain day 2"
    # And the history is bounded regardless of study length (arc + <=cap recent).
    assert len(compressed.split()) <= 1200, "compressed history must stay bounded"


def test_verse_pool_seeds_day1_passages(client):
    """selected_refs at create -> day 1 uses those exact verses."""
    refs = ["John 14:27", "Phil 4:6-7"]
    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "Peace", "total_days": 1,
                                "minutes_per_day": 15,
                                "selected_refs": refs}).json()["study_id"]
        for _ in range(50):
            if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
                break
            time.sleep(0.1)
    outline = client.get(f"/api/studies/{sid}").json()["outline_json"]
    day1 = next(d for d in outline["days"] if d["day_number"] == 1)
    got_refs = {p["ref"] for p in day1["suggested_passages"]}
    assert got_refs == set(refs), got_refs  # outline keeps the user's raw refs
    passage_refs = {p["ref"] for p in
                    client.get(f"/api/studies/{sid}/days/1/passages").json()}
    # resolved passages are normalized to canonical book names
    assert passage_refs == {"John 14:27", "Philippians 4:6-7"}, passage_refs


def test_verse_pool_split_across_days(client):
    """A curated pool is distributed across days, not dumped into day 1."""
    refs = ["John 15:11", "Psalm 5:11", "Isaiah 9:3",
            "Romans 15:13", "Nehemiah 8:10", "Philippians 4:4"]
    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "Joy", "total_days": 3,
                                "minutes_per_day": 12,
                                "selected_refs": refs}).json()["study_id"]
        for _ in range(50):
            if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
                break
            time.sleep(0.1)
    outline = client.get(f"/api/studies/{sid}").json()["outline_json"]
    by_day = {d["day_number"]: [p["ref"] for p in d["suggested_passages"]]
              for d in outline["days"]}
    # every curated verse appears on some day (chronological round-robin)
    all_assigned = [r for refs_on_day in by_day.values() for r in refs_on_day]
    for ref in refs:
        assert ref in all_assigned, f"{ref} missing from {all_assigned}"
    # day 1 must NOT contain the whole pool
    assert len(by_day[1]) < len(refs), by_day[1]
    # at least 2 days received verses from the pool
    assert sum(1 for v in by_day.values() if v) >= 2, by_day


def test_prayer_prompt_quotes_verse(client):
    """DAY_PROMPT must instruct both prayers to open by quoting the verse."""
    from app.services.planner import DAY_PROMPT
    assert "OPEN by quoting" in DAY_PROMPT, "prayer prompt must require a verse quote"
    assert "closing_prayer" in DAY_PROMPT


def test_passage_note_saved_in_highlights(client):
    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "Note", "total_days": 1,
                                "minutes_per_day": 15}).json()["study_id"]
        for _ in range(50):
            if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
                break
            time.sleep(0.1)
    pid = client.get(f"/api/studies/{sid}/days/1/passages").json()[0]["id"]
    r = client.put(f"/api/studies/{sid}/days/1/passages/{pid}",
                   json={"note": "God met me here."})
    assert r.status_code == 200
    hl = r.json()["highlights"]
    assert hl and hl[0].get("note") == "God met me here."
    again = client.get(f"/api/studies/{sid}/days/1/passages").json()[0]
    assert again["highlights"][0]["note"] == "God met me here."


def test_day_notes_persisted(client):
    with patch("app.services.planner.complete", _smart_stub):
        sid = client.post("/api/studies",
                          json={"topic": "DayNote", "total_days": 1,
                                "minutes_per_day": 15}).json()["study_id"]
        for _ in range(50):
            if client.get(f"/api/studies/{sid}").json()["status"] == "ready":
                break
            time.sleep(0.1)
    edited = {"heading": "H", "opening_prayer": "p", "scripture": [],
              "commentary": "c", "questions": ["q"], "closing_prayer": "cp"}
    r = client.put(f"/api/studies/{sid}/days/1",
                   json={"blocks_json": edited,
                         "notes": {"commentary": "my takeaway"}})
    assert r.status_code == 200
    got = client.get(f"/api/studies/{sid}").json()["days"][0]
    assert got["notes"] == {"commentary": "my takeaway"}
