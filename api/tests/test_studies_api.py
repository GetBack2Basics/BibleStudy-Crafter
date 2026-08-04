"""Task 13: /api/studies create -> 202, poll, day-1 eager generation.

Runs against an in-memory SQLite DB with the LLM stubbed (no keys needed).
"""
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool


async def _smart_stub(*a, **k):
    """Return OUTLINE for the outline call, DAY for a day-draft call."""
    from app.services.llm import LLMResult
    prompt = a[0] if a else k.get("prompt", "")
    payload = DAY if "Write day" in prompt else OUTLINE
    return LLMResult(text=json.dumps(payload), provider="ollama", model="m",
                     tokens_in=1, tokens_out=1, data=payload)


@pytest.fixture
def client():
    from app import db as db_mod
    from app.main import app

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    # Seed a couple of verses so the anti-hallucination resolve path is real
    from app.models import Translation, Verse
    with Session(engine) as s:
        tr = Translation(code="KJV", source_id="eng_kjv", name="KJV")
        s.add(tr); s.commit(); s.refresh(tr)
        s.add(Verse(translation_id=tr.id, book_number=40, chapter=6, verse=14,
                    text="For if you forgive others their trespasses"))
        s.add(Verse(translation_id=tr.id, book_number=40, chapter=6, verse=15,
                    text="but if you do not forgive others their trespasses"))
        s.commit()
    # The background task opens its own sessions via get_engine(); point it at
    # the same in-memory DB.
    db_mod._engine = engine

    def _get_session():
        return Session(engine)

    app.dependency_overrides[db_mod.get_session] = _get_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    db_mod._engine = None


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
