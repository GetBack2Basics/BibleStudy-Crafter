import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from app.models import User, Setting


def test_profile_update(client: TestClient):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    user_data = resp.json()
    assert "email" in user_data
    assert user_data["role"] in ("SUPER_ADMIN", "ADMIN", "MEMBER")

    # Update profile
    patch_resp = client.patch("/api/auth/profile", json={
        "display_name": "Pastor David",
        "organization": "Grace Chapel",
        "phone": "+1-555-123-4567",
        "notes": "Testing profile notes"
    })
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["display_name"] == "Pastor David"
    assert updated["organization"] == "Grace Chapel"
    assert updated["phone"] == "+1-555-123-4567"
    assert updated["notes"] == "Testing profile notes"


def test_byok_settings_save_and_mask(client: TestClient):
    # Initial status
    status_resp = client.get("/api/keys/status")
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert "use_custom_keys" in data
    assert "server_free_providers" in data

    # Save custom keys
    save_resp = client.post("/api/keys/settings", json={
        "use_custom_keys": True,
        "preferred_provider": "gemini",
        "gemini_api_key": "AIzaSy_Secret_Test_Key_12345",
        "openrouter_api_key": "sk-or-v1-my-secret-openrouter-key-9999",
    })
    assert save_resp.status_code == 200
    saved = save_resp.json()
    assert saved["use_custom_keys"] is True
    assert saved["preferred_provider"] == "gemini"
    assert saved["has_gemini"] is True
    assert saved["has_openrouter"] is True
    # Verify masked output
    assert saved["masked_keys"]["gemini"].startswith("AIzaSy")
    assert saved["masked_keys"]["gemini"].endswith("2345")
    assert "Secret" not in saved["masked_keys"]["gemini"]
