"""Google OAuth login tests (tokeninfo mocked; no network).

Covers the cheatsheet pattern: POST /api/auth/google verifies a Google ID
token, auto-creates/links the user by email, and promotes the ONE
super-admin email to admin. The tokeninfo call is mocked so tests stay offline.
"""
import time

import pytest
import respx

from app.main import app
from app.config import Settings, get_settings

SUPER = "coreagc@gmail.com"
CLIENT_ID = "my-client-id.apps.googleusercontent.com"


@pytest.fixture
def settings_override():
    s = get_settings()
    original = (s.super_admin_email, s.google_client_id)
    s.super_admin_email = SUPER
    s.google_client_id = CLIENT_ID
    yield s
    s.super_admin_email, s.google_client_id = original


def _good_payload(email, aud=CLIENT_ID, verified=True):
    return {
        "iss": "accounts.google.com",
        "email": email,
        "email_verified": verified,
        "name": email.split("@")[0].title(),
        "aud": aud,
        "exp": int(time.time()) + 3600,
    }


@respx.mock
def test_google_superadmin_promoted(anon_client, settings_override):
    payload = _good_payload(SUPER)
    respx.get("https://oauth2.googleapis.com/tokeninfo").mock(
        return_value=respx.MockResponse(json=payload, status_code=200))

    r = anon_client.post("/api/auth/google", json={"id_token": "fake"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["email"] == SUPER
    assert body["user"]["is_admin"] is True
    assert "access_token" in body


@respx.mock
def test_google_ordinary_user_created(anon_client, settings_override):
    payload = _good_payload("player@example.com")
    respx.get("https://oauth2.googleapis.com/tokeninfo").mock(
        return_value=respx.MockResponse(json=payload, status_code=200))

    r = anon_client.post("/api/auth/google", json={"id_token": "fake"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["is_admin"] is False


@respx.mock
def test_google_invalid_token_rejected(anon_client, settings_override):
    # tokeninfo returns 400 -> token invalid
    respx.get("https://oauth2.googleapis.com/tokeninfo").mock(
        return_value=respx.MockResponse(json={"error": "invalid"}, status_code=400))
    r = anon_client.post("/api/auth/google", json={"id_token": "bad"})
    assert r.status_code == 401


@respx.mock
def test_google_audience_mismatch_rejected(anon_client, settings_override):
    # Token minted for a different client id must be rejected.
    payload = _good_payload("player@example.com", aud="other-client-id")
    respx.get("https://oauth2.googleapis.com/tokeninfo").mock(
        return_value=respx.MockResponse(json=payload, status_code=200))
    r = anon_client.post("/api/auth/google", json={"id_token": "fake"})
    assert r.status_code == 401


@respx.mock
def test_google_network_failure_is_502(anon_client, settings_override):
    import httpx
    respx.get("https://oauth2.googleapis.com/tokeninfo").mock(
        side_effect=httpx.ConnectError("boom"))
    r = anon_client.post("/api/auth/google", json={"id_token": "fake"})
    assert r.status_code == 502


@respx.mock
def test_google_unverified_email_rejected(anon_client, settings_override):
    payload = _good_payload("player@example.com", verified=False)
    respx.get("https://oauth2.googleapis.com/tokeninfo").mock(
        return_value=respx.MockResponse(json=payload, status_code=200))
    r = anon_client.post("/api/auth/google", json={"id_token": "fake"})
    assert r.status_code == 401
