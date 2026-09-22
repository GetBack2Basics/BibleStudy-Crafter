"""TTS endpoint behaviour + gTTS render path (mocked).

Covers auth, ownership, day-content, and asset lifecycle paths. The render test
patches asyncio.create_task so the fire-and-forget background task completes inside
the in-memory test process (the TestClient's event loop would otherwise close before
the background task runs).

Provider: gTTS only (edge-tts removed — Microsoft permanently blocked its token).
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from typing import Any

from app.models import Asset, Study, StudyDay
from tests.conftest import direct_session

def _make_owned_study(client: TestClient, topic: str = "Test",
                       total_days: int = 1, user_id: int = 1) -> Study:
    with direct_session(client) as s:
        study = Study(topic=topic, minutes_per_day=15, total_days=total_days,
                      tradition="non_denominational", primary_translation="KJV",
                      status="ready", user_id=user_id)
        s.add(study); s.commit(); s.refresh(study)
        return study


def _seed_day_with_content(client: TestClient, study: Study,
                            day_number: int = 1) -> StudyDay:
    with direct_session(client) as s:
        day = StudyDay(study_id=study.id, day_number=day_number, status="ready",
                       blocks_json={
                           "opening_prayer": "Heavenly Father, bless this study.",
                           "commentary": "Grace and truth came through Jesus Christ.",
                           "questions": ["What does grace mean?"],
                           "closing_prayer": "Amen.",
                       })
        s.add(day); s.commit(); s.refresh(day)
        return day


_MP3 = b"\x00\x00\x00\x00" + b"\x00" * 64


class _FakeGTTs:
    def __init__(self, *args, **kwargs):
        pass
    def save(self, path: str) -> None:
        Path(path).write_bytes(_MP3)


def _run_coro_imm(coro):
    """Run an async coroutine synchronously — used to make the fire-and-forget
    TTS task complete inside tests."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    # Loop is already running (we're inside TestClient request handling).
    # Run the coroutine in a thread with its own event loop so it completes
    # without deadlocking the caller's loop.
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


@pytest.fixture(autouse=True)
def _reset_voices():
    import app.routers.tts as tts_mod
    tts_mod._voices = None
    yield


def _patch_create_task(client: TestClient):
    """Patch asyncio.create_task so the TTS background task runs synchronously
    inside the test (the TestClient event loop would otherwise close before the
    fire-and-forget task completes)."""
    return patch("asyncio.create_task", side_effect=_run_coro_imm)


def test_voices_returns_list_when_gtts_available(client: TestClient) -> None:
    with patch("app.routers.tts._gtts_langs",
               return_value=[{"short_name": "gtts-en",
                              "gender": "",
                              "friendly_name": "Google English (en)",
                              "locale": "en"}]):
        r = client.get("/api/tts/voices")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["voices"][0]["short_name"] == "gtts-en"


def test_voices_empty_when_gtts_unavailable(client: TestClient) -> None:
    with patch("app.routers.tts._gtts_langs", return_value=[]):
        r = client.get("/api/tts/voices")
    assert r.status_code == 200
    assert r.json()["count"] == 0


def test_render_requires_auth(anon_client: TestClient) -> None:
    r = anon_client.post("/api/tts/render", json={
        "study_id": 1, "day_number": 1, "voice": "gtts-en",
    })
    assert r.status_code == 401
    assert (
        "missing" in r.json()["detail"].lower()
        or "authorization" in r.json()["detail"].lower()
        or "credential" in r.json()["detail"].lower()
    )


def test_render_rejects_unknown_study(client: TestClient) -> None:
    r = client.post("/api/tts/render", json={
        "study_id": 99999, "day_number": 1, "voice": "gtts-en",
    })
    assert r.status_code == 404


def test_render_rejects_day_out_of_range(client: TestClient) -> None:
    study = _make_owned_study(client, total_days=2)
    _seed_day_with_content(client, study, 1)
    _seed_day_with_content(client, study, 2)
    r = client.post("/api/tts/render", json={
        "study_id": study.id, "day_number": 3, "voice": "gtts-en",
    })
    assert r.status_code == 400


def test_render_rejects_empty_day(client: TestClient) -> None:
    study = _make_owned_study(client)
    day = _seed_day_with_content(client, study)
    with direct_session(client) as s:
        d = s.get(StudyDay, day.id)
        # Reassign the dict to ensure SQLAlchemy detects the change
        d.blocks_json = {}
        s.add(d); s.commit()
    r = client.post("/api/tts/render", json={
        "study_id": study.id, "day_number": 1, "voice": "gtts-en",
    })
    assert r.status_code == 400


def test_render_rejects_unknown_voice(client: TestClient) -> None:
    study = _make_owned_study(client)
    _seed_day_with_content(client, study)
    r = client.post("/api/tts/render", json={
        "study_id": study.id, "day_number": 1,
        "voice": "unlikely-voice-short-name",
    })
    assert r.status_code == 400


def test_render_creates_rendering_asset(client: TestClient) -> None:
    study = _make_owned_study(client)
    _seed_day_with_content(client, study)
    with patch("app.routers.tts._gtts_langs",
               return_value=[{"short_name": "gtts-en",
                              "gender": "",
                              "friendly_name": "Google English (en)",
                              "locale": "en"}]):
        r = client.post("/api/tts/render", json={
            "study_id": study.id, "day_number": 1, "voice": "gtts-en",
        })
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "rendering"
    asset_id = body["asset_id"]
    with direct_session(client) as s:
        asset = s.get(Asset, asset_id)
    assert asset is not None
    assert asset.status == "rendering"
    assert asset.kind == "audio"
    assert asset.provider == "gtts"
    assert asset.model == "gtts-en"


def test_render_happy_path_writes_mp3_to_asset(client: TestClient) -> None:
    study = _make_owned_study(client)
    _seed_day_with_content(client, study)
    with _patch_create_task(client), \
         patch("app.routers.tts._gtts_langs",
               return_value=[{"short_name": "gtts-en",
                              "gender": "",
                              "friendly_name": "Google English (en)",
                              "locale": "en"}]), \
         patch("gtts.gTTS", return_value=_FakeGTTs()):
        r = client.post("/api/tts/render", json={
            "study_id": study.id, "day_number": 1, "voice": "gtts-en",
        })
    assert r.status_code == 202
    asset_id = r.json()["asset_id"]
    with direct_session(client) as s:
        asset = s.get(Asset, asset_id)
    assert asset is not None
    assert asset.status == "ready"
    assert asset.media_type == "audio/mpeg"
    assert asset.content == _MP3


def test_asset_ready_serves_mp3(client: TestClient) -> None:
    study = _make_owned_study(client)
    day = _seed_day_with_content(client, study)
    with direct_session(client) as s:
        asset = Asset(study_day_id=day.id, kind="audio", provider="gtts",
                      model="gtts-en", prompt="", status="ready",
                      error="", media_type="audio/mpeg", content=_MP3)
        s.add(asset); s.commit(); s.refresh(asset)
        asset_id = asset.id
    r = client.get(f"/api/tts/asset/{asset_id}")
    assert r.status_code == 200
    assert r.content == _MP3
    assert r.headers["content-type"] == "audio/mpeg"
    assert "tts-" in r.headers["content-disposition"]


def test_asset_poll_returns_202_while_rendering(client: TestClient) -> None:
    study = _make_owned_study(client)
    day = _seed_day_with_content(client, study)
    with direct_session(client) as s:
        asset = Asset(study_day_id=day.id, kind="audio", provider="gtts",
                      model="gtts-en", prompt="", status="rendering",
                      error="", media_type="", content=b"")
        s.add(asset); s.commit(); s.refresh(asset)
        asset_id = asset.id
    r = client.get(f"/api/tts/asset/{asset_id}")
    assert r.status_code == 202


def test_asset_failed_returns_409_with_error(client: TestClient) -> None:
    study = _make_owned_study(client)
    day = _seed_day_with_content(client, study)
    with direct_session(client) as s:
        asset = Asset(study_day_id=day.id, kind="audio", provider="gtts",
                      model="gtts-en", prompt="", status="failed",
                      error="gTTS render failed", media_type="",
                      content=b"")
        s.add(asset); s.commit(); s.refresh(asset)
        asset_id = asset.id
    r = client.get(f"/api/tts/asset/{asset_id}")
    assert r.status_code == 409
    assert "gTTS" in r.json()["detail"]


def test_asset_unknown_is_404(client: TestClient) -> None:
    r = client.get("/api/tts/asset/99999")
    assert r.status_code == 404


def test_asset_belonging_to_other_study_is_404(client: TestClient) -> None:
    other = _make_owned_study(client, topic="Other", user_id=999)
    day = _seed_day_with_content(client, other)
    with direct_session(client) as s:
        asset = Asset(study_day_id=day.id, kind="audio", provider="gtts",
                      model="gtts-en", prompt="", status="ready",
                      error="", media_type="audio/mpeg", content=_MP3)
        s.add(asset); s.commit(); s.refresh(asset)
        asset_id = asset.id
    r = client.get(f"/api/tts/asset/{asset_id}")
    assert r.status_code == 404
