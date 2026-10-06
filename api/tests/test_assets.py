"""Tests for visual assets, prompt crafter, structured infographics, and image rendering."""
import pytest
from sqlmodel import Session, select

from app.models import Asset, Study, StudyDay, User
from app.services import art_service
from tests.conftest import direct_session


def _seed_study_and_day(client) -> tuple[int, int]:
    with direct_session(client) as session:
        user = session.exec(select(User)).first()
        study = Study(
            user_id=user.id if user else None,
            topic="Peace in the Storm",
            title="Peace in the Storm",
            minutes_per_day=15,
            total_days=3,
            tradition="non_denominational",
            imagery_policy="symbolic",
            status="ready",
        )
        session.add(study)
        session.commit()
        session.refresh(study)

        day = StudyDay(
            study_id=study.id,
            day_number=1,
            title="Calming the Sea",
            theme="Jesus rebukes the wind and waves",
            status="ready",
            blocks_json={
                "heading": "Calming the Sea",
                "opening_prayer": "Lord God, when the tempest rises, grant us peace.",
                "scripture": [
                    {
                        "ref": "Mark 4:35-41",
                        "text": "And he arose, and rebuked the wind, and said unto the sea, Peace, be still.",
                        "translation": "KJV",
                    }
                ],
                "commentary": "The storm was furious, but Christ's word brought immediate stillness. In our trials, peace is not the absence of trouble, but the presence of God.",
                "questions": ["What storm in your life feels overwhelming right now?"],
                "closing_prayer": "Father, be our anchor and our calm. Amen.",
            },
        )
        session.add(day)
        session.commit()
        session.refresh(day)
        return study.id, day.day_number


def test_get_art_presets(client):
    res = client.get("/api/art/presets")
    assert res.status_code == 200
    data = res.json()
    assert "styles" in data
    assert "moods" in data
    assert "aspect_ratios" in data
    assert any(s["id"] == "classical_oil" for s in data["styles"])
    assert any(m["id"] == "peaceful_contemplative" for m in data["moods"])


def test_suggest_art_prompt(client, monkeypatch):
    study_id, day_number = _seed_study_and_day(client)

    # Stub complete to return structured prompt output
    async def fake_complete(prompt, system="", json_mode=False, **kwargs):
        from app.services.llm import LLMResult
        return LLMResult(
            text="",
            provider="stub",
            model="stub",
            data={
                "cover_art_prompt": "A tranquil sea at dawn with golden light breaking through parting storm clouds, ancient wooden boat gently resting on calm waters, classical oil style",
                "infographic_art_prompt": "Visual summary of peace amid the storm with anchor and lighthouse motifs",
                "artistic_rationale": "Symbolic depiction honoring the imagery policy avoiding faces.",
                "negative_prompt": "text, cartoon, distorted faces",
            },
        )

    monkeypatch.setattr("app.services.art_service.complete", fake_complete)

    res = client.post(
        f"/api/studies/{study_id}/days/{day_number}/art/suggest-prompt",
        json={
            "style_id": "classical_oil",
            "mood_id": "peaceful_contemplative",
            "custom_guidance": "Focus on the dawn light and calm water",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "cover_art_prompt" in data
    assert "tranquil sea" in data["cover_art_prompt"]
    assert "infographic_art_prompt" in data
    assert data["style_id"] == "classical_oil"


def test_extract_structured_infographic(client, monkeypatch):
    study_id, day_number = _seed_study_and_day(client)

    async def fake_complete(prompt, system="", json_mode=False, **kwargs):
        from app.services.llm import LLMResult
        return LLMResult(
            text="",
            provider="stub",
            model="stub",
            data={
                "title": "Peace Over the Storm",
                "central_thesis": "Christ's presence turns panic into peace.",
                "pillars": [
                    {
                        "title": "Sudden Storms",
                        "icon": "water_drop",
                        "insight": "Trials can arise without warning in life's journey.",
                        "scripture_ref": "Mark 4:37",
                        "key_phrase": "Wind and waves",
                    },
                    {
                        "title": "Divine Authority",
                        "icon": "shield",
                        "insight": "Jesus speaks peace directly into turmoil.",
                        "scripture_ref": "Mark 4:39",
                        "key_phrase": "Peace, be still",
                    },
                    {
                        "title": "Abiding Rest",
                        "icon": "anchor",
                        "insight": "Resting securely in God's sovereign care.",
                        "scripture_ref": "Mark 4:40",
                        "key_phrase": "Faith over fear",
                    },
                ],
                "key_verse": {
                    "ref": "Mark 4:39",
                    "text": "Peace, be still.",
                },
                "practical_walkaway": "Surrender your biggest anxiety today to God in quiet prayer.",
            },
        )

    monkeypatch.setattr("app.services.art_service.complete", fake_complete)

    res = client.post(
        f"/api/studies/{study_id}/days/{day_number}/infographic/structured",
    )
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Peace Over the Storm"
    assert len(data["pillars"]) == 3
    assert data["pillars"][1]["icon"] == "shield"
    assert data["key_verse"]["ref"] == "Mark 4:39"


def test_generate_svg_infographic_asset(client):
    study_id, day_number = _seed_study_and_day(client)

    res = client.post(
        f"/api/studies/{study_id}/days/{day_number}/infographic/svg",
    )
    assert res.status_code == 200
    data = res.json()
    assert data["kind"] == "infographic"
    assert data["media_type"] == "image/svg+xml"
    assert data["is_active"] is True
    assert data["has_content"] is True

    asset_id = data["id"]
    # Fetch asset content
    media_res = client.get(f"/api/assets/{asset_id}")
    assert media_res.status_code == 200
    assert media_res.headers["content-type"] == "image/svg+xml"
    assert "<svg" in media_res.text


@pytest.mark.asyncio
async def test_render_art_and_asset_lifecycle(client):
    study_id, day_number = _seed_study_and_day(client)

    # 1. Enqueue Cover Art render
    res = client.post(
        f"/api/studies/{study_id}/days/{day_number}/art/render",
        json={
            "kind": "cover_art",
            "prompt": "Golden dawn light over calm waters of Galilee",
            "style_preset": "classical_oil",
            "aspect_ratio": "16:9",
            "is_active": True,
        },
    )
    assert res.status_code == 202
    body = res.json()
    asset_id = body["asset_id"]

    # Run render directly to simulate background task completion
    with direct_session(client) as session:
        await art_service.render_image_asset(
            asset_id=asset_id,
            prompt="Golden dawn light over calm waters of Galilee",
            aspect_ratio="16:9",
            engine=session.get_bind(),
        )

    # 2. List assets for day
    list_res = client.get(
        f"/api/studies/{study_id}/days/{day_number}/assets",
    )
    assert list_res.status_code == 200
    assets = list_res.json()
    assert len(assets) >= 1
    cover = next(a for a in assets if a["id"] == asset_id)
    assert cover["status"] == "ready"
    assert cover["kind"] == "cover_art"
    assert cover["is_active"] is True

    # 3. Create a second asset and set active
    res2 = client.post(
        f"/api/studies/{study_id}/days/{day_number}/art/render",
        json={
            "kind": "cover_art",
            "prompt": "Second variation in watercolor style",
            "style_preset": "watercolor",
            "aspect_ratio": "16:9",
            "is_active": False,
        },
    )
    assert res2.status_code == 202
    asset2_id = res2.json()["asset_id"]

    # Activate asset 2
    act_res = client.put(
        f"/api/studies/{study_id}/days/{day_number}/assets/{asset2_id}/active",
    )
    assert act_res.status_code == 200
    assert act_res.json()["is_active"] is True

    # Verify asset 1 became inactive
    list_res2 = client.get(
        f"/api/studies/{study_id}/days/{day_number}/assets",
    )
    assets2 = list_res2.json()
    c1 = next(a for a in assets2 if a["id"] == asset_id)
    c2 = next(a for a in assets2 if a["id"] == asset2_id)
    assert c1["is_active"] is False
    assert c2["is_active"] is True

    # 4. Delete asset 2
    del_res = client.delete(
        f"/api/studies/{study_id}/days/{day_number}/assets/{asset2_id}",
    )
    assert del_res.status_code == 200
