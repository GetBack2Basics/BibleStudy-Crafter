"""Passage CRUD: add / switch version / reorder / delete / highlights."""
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import db as db_mod
from app.auth import hash_password
from app.main import app


@pytest.fixture
def client():
    from app.auth import get_current_user
    from app.models import Translation, User, Verse
    from sqlmodel import SQLModel, create_engine, select
    from sqlalchemy.pool import StaticPool
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        tr = Translation(code="KJV", source_id="eng_kjv", name="KJV")
        s.add(tr); s.commit(); s.refresh(tr)
        s.add(Verse(translation_id=tr.id, book_number=40, chapter=6, verse=14,
                    text="For if you forgive others their trespasses"))
        s.add(Verse(translation_id=tr.id, book_number=41, chapter=4, verse=39,
                    text="Peace, be still"))
        # seed an authenticated user (auth is now required on study routes)
        user = User(email="tester@example.com", password_hash=hash_password("password123"),
                    is_admin=False)
        s.add(user); s.commit(); s.refresh(user)
        user_id = user.id
    db_mod._engine = engine

    def _get_session():
        return Session(engine)

    def _fake_user():
        with Session(engine) as s:
            return s.get(User, user_id)

    app.dependency_overrides[db_mod.get_session] = _get_session
    app.dependency_overrides[get_current_user] = _fake_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    db_mod._engine = None


async def _stub(*a, **k):
    from app.services.llm import LLMResult
    prompt = a[0] if a else ""
    payload = {"heading": "H", "opening_prayer": "p", "commentary": "c",
               "questions": ["q"], "closing_prayer": "cp"} if "Write day" in prompt else {
        "title": "T", "summary": "s",
        "days": [{"day_number": 1, "title": "D1", "focus": "f", "est_minutes": 15,
                  "suggested_passages": [{"ref": "Mark 4:39", "rationale": "r"}]}]}
    return LLMResult(text=json.dumps(payload), provider="ollama", model="m",
                     tokens_in=1, tokens_out=1, data=payload)


def _make_study(c):
    import time
    with patch("app.services.planner.complete", _stub):
        sid = c.post("/api/studies", json={"topic": "Peace", "total_days": 1}).json()["study_id"]
        for _ in range(100):
            d = c.get(f"/api/studies/{sid}").json()
            if d["days"] and d["days"][0]["blocks_json"]:
                break
            time.sleep(0.1)
    return sid


def test_passage_crud(client):
    sid = _make_study(client)
    # generation should have created one passage (Mark 4:39)
    r = client.get(f"/api/studies/{sid}/days/1/passages")
    assert r.status_code == 200
    passages = r.json()
    assert len(passages) == 1
    pid = passages[0]["id"]
    assert passages[0]["ref"] == "Mark 4:39"

    # add a second passage
    r2 = client.post(f"/api/studies/{sid}/days/1/passages",
                      json={"ref": "Matt 6:14"})
    assert r2.status_code == 200
    assert len(client.get(f"/api/studies/{sid}/days/1/passages").json()) == 2

    # switch its version (re-resolves text)
    r3 = client.put(f"/api/studies/{sid}/days/1/passages/{pid}",
                    json={"translation": "KJV"})
    assert r3.status_code == 200

    # reorder
    r4 = client.put(f"/api/studies/{sid}/days/1/passages/{pid}", json={"order": 5})
    assert r4.status_code == 200

    # highlights (reflection)
    r5 = client.put(f"/api/studies/{sid}/days/1/passages/{pid}",
                    json={"highlights": [{"text": "Peace, be still", "note": "God's power"}]})
    assert r5.status_code == 200
    assert r5.json()["highlights"][0]["note"] == "God's power"

    # delete
    pid2 = client.get(f"/api/studies/{sid}/days/1/passages").json()[1]["id"]
    r6 = client.delete(f"/api/studies/{sid}/days/1/passages/{pid2}")
    assert r6.status_code == 200
    assert len(client.get(f"/api/studies/{sid}/days/1/passages").json()) == 1


def test_passage_bad_translation_rejected(client):
    sid = _make_study(client)
    r = client.post(f"/api/studies/{sid}/days/1/passages",
                    json={"ref": "John 3:16", "translation": "NOPE"})
    assert r.status_code == 400


def test_status_ready_implies_day1_generated(client):
    """Regression: status 'ready' must only be set AFTER day 1 (blocks + passages) is done."""
    sid = _make_study(client)
    study = client.get(f"/api/studies/{sid}").json()
    assert study["status"] == "ready"
    assert study["days"][0]["blocks_json"] is not None
    passages = client.get(f"/api/studies/{sid}/days/1/passages").json()
    assert len(passages) >= 1
    assert passages[0]["text"]  # resolved scripture text present
