"""Auth + access-control tests (real get_current_user dependency via anon_client)."""
import pytest


def _register(c, email="a@example.com", pw="password123"):
    return c.post("/api/auth/register", json={"email": email, "password": pw})


def _login(c, email="a@example.com", pw="password123"):
    return c.post("/api/auth/login", json={"email": email, "password": pw})


def test_register_then_login_then_me(anon_client):
    r = _register(anon_client)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "a@example.com"
    token = body["access_token"]

    # /me with the token
    me = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "a@example.com"

    # login returns tokens too
    lg = _login(anon_client)
    assert lg.status_code == 200, lg.text
    assert "access_token" in lg.json()


def test_duplicate_email_conflicts(anon_client):
    assert _register(anon_client).status_code == 201
    second = _register(anon_client, email="a@example.com")
    assert second.status_code == 409


def test_password_too_short_rejected(anon_client):
    r = _register(anon_client, email="b@example.com", pw="short")
    assert r.status_code == 400


def test_bad_login_rejected(anon_client):
    _register(anon_client)
    bad = _login(anon_client, pw="wrongpassword")
    assert bad.status_code == 401


def test_no_token_is_401(anon_client):
    # studies list requires auth now
    assert anon_client.get("/api/studies").status_code == 401
    # preferences require auth now
    assert anon_client.get("/api/preferences/translations").status_code == 401


def test_refresh_rotates_token(anon_client):
    reg = _register(anon_client).json()
    rt = reg["refresh_token"]
    refreshed = anon_client.post("/api/auth/refresh", json={"refresh_token": rt})
    assert refreshed.status_code == 200, refreshed.text
    new_rt = refreshed.json()["refresh_token"]
    assert new_rt != rt
    # old refresh token is now revoked
    reuse = anon_client.post("/api/auth/refresh", json={"refresh_token": rt})
    assert reuse.status_code == 401


def test_tampered_access_token_rejected(anon_client):
    tok = _register(anon_client).json()["access_token"]
    bad = tok + "x"
    me = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad}"})
    assert me.status_code == 401


def test_user_cannot_see_others_studies(anon_client):
    """Two users; each only sees their own studies (ownership enforced)."""
    # User A
    a = _register(anon_client, email="a@example.com").json()
    ta = a["access_token"]
    ra = _register(anon_client, email="b@example.com").json()
    tb = ra["access_token"]

    # A creates a study (stub LLM not needed for 202; background task may fail
    # but the row is created). We just confirm the create returns 202 and the
    # study is owned by A.
    study = anon_client.post("/api/studies",
                             json={"topic": "Peace", "minutes_per_day": 15, "total_days": 3},
                             headers={"Authorization": f"Bearer {ta}"})
    assert study.status_code == 202
    sid = study.json()["study_id"]

    # B must NOT see A's study (404, not 200/403 leakage)
    see = anon_client.get(f"/api/studies/{sid}", headers={"Authorization": f"Bearer {tb}"})
    assert see.status_code == 404
    # B's list is empty
    lst = anon_client.get("/api/studies", headers={"Authorization": f"Bearer {tb}"})
    assert lst.status_code == 200 and lst.json() == []
    # A can see it
    assert anon_client.get(f"/api/studies/{sid}", headers={"Authorization": f"Bearer {ta}"}).status_code == 200


def test_self_escalation_to_admin_blocked(anon_client):
    """An ordinary user cannot flip their own is_admin via any public route."""
    reg = _register(anon_client, email="c@example.com").json()
    token = reg["access_token"]
    assert reg["user"]["is_admin"] is False
    # There is no self-promote route; /admin/promote requires an admin.
    prom = anon_client.post("/api/auth/admin/promote",
                            json={"user_id": reg["user"]["id"], "is_admin": True},
                            headers={"Authorization": f"Bearer {token}"})
    assert prom.status_code == 403
    me = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["is_admin"] is False
