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


def test_demo_account_login_and_normalization(anon_client):
    from app.db import ensure_demo_account
    ensure_demo_account()

    # Login with 'demo'
    r1 = anon_client.post("/api/auth/login", json={"email": "demo", "password": "demo123"})
    assert r1.status_code == 200, r1.text
    data1 = r1.json()
    assert data1["user"]["email"] == "demo@biblestudy.local"
    assert "access_token" in data1

    # Login with 'demo@example.com'
    r2 = anon_client.post("/api/auth/login", json={"email": "demo@example.com", "password": "demo123"})
    assert r2.status_code == 200, r2.text
    data2 = r2.json()
    assert data2["user"]["email"] == "demo@biblestudy.local"


def test_demo_account_copies_coreagc_study(anon_client):
    from app.db import get_engine, ensure_demo_account
    from sqlmodel import Session, select
    from app.models import User, Study, StudyDay, DayPassage, Asset
    from app.auth import hash_password

    # Setup coreagc user and a study with a day, passage, and asset
    with Session(get_engine()) as session:
        core_user = session.exec(select(User).where(User.email == "coreagc@gmail.com")).first()
        if not core_user:
            core_user = User(
                email="coreagc@gmail.com",
                display_name="Corea",
                password_hash=hash_password("corea123"),
                role="SUPER_ADMIN",
                is_admin=True,
            )
            session.add(core_user)
            session.commit()
            session.refresh(core_user)

        study = Study(
            user_id=core_user.id,
            topic="Faith and Hope",
            title="Faith and Hope Study",
            minutes_per_day=10,
            total_days=1,
            tradition="non_denominational",
            status="ready",
        )
        session.add(study)
        session.commit()
        session.refresh(study)
        orig_study_id = study.id

        day = StudyDay(
            study_id=study.id,
            day_number=1,
            title="Day 1 - The Foundation",
            theme="Faith",
            status="ready",
        )
        session.add(day)
        session.commit()
        session.refresh(day)

        passage = DayPassage(
            study_day_id=day.id,
            ref="Hebrews 11:1",
            translation="KJV",
            text="Now faith is the substance of things hoped for...",
            order=1,
        )
        session.add(passage)

        asset = Asset(
            user_id=core_user.id,
            study_day_id=day.id,
            kind="infographic",
            provider="local",
            model="test",
            status="ready",
        )
        session.add(asset)
        session.commit()

    # Now ensure demo account runs
    ensure_demo_account()

    # Demo logs in and gets their studies
    r = anon_client.post("/api/auth/login", json={"email": "demo", "password": "demo123"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    demo_id = r.json()["user"]["id"]

    studies_res = anon_client.get("/api/studies", headers={"Authorization": f"Bearer {token}"})
    assert studies_res.status_code == 200
    studies = studies_res.json()
    assert len(studies) >= 1
    demo_study = next((s for s in studies if s["topic"] == "Faith and Hope"), None)
    assert demo_study is not None
    assert demo_study["title"] == "Faith and Hope Study"
    assert demo_study["id"] != orig_study_id


