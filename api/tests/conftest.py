"""Shared pytest fixtures (in-memory SQLite + TestClient).

The app now requires authentication on study/passage/preference routes. The
default `client` fixture seeds a user and overrides `get_current_user` so the
pre-existing tests keep working without per-test tokens. Security tests use the
`anon_client` fixture, which keeps the real auth dependency (so 401/403 paths
are exercised for real).
"""
import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app.auth import hash_password
from app.models import Translation, User, Verse


def _make_engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    return engine


def _seed(engine):
    with Session(engine) as s:
        tr = Translation(code="KJV", source_id="eng_kjv", name="KJV")
        s.add(tr); s.commit(); s.refresh(tr)
        s.add(Verse(translation_id=tr.id, book_number=40, chapter=6, verse=14,
                    text="For if you forgive others their trespasses"))
        s.add(Verse(translation_id=tr.id, book_number=40, chapter=6, verse=15,
                    text="but if you do not forgive others their trespasses"))
        s.add(Verse(translation_id=tr.id, book_number=43, chapter=3, verse=16,
                    text="For God so loved the world, that he gave his only "
                         "begotten Son"))
        s.commit()


@pytest.fixture
def client():
    from app import db as db_mod
    from app.auth import get_current_user
    from app.main import app

    engine = _make_engine()
    _seed(engine)
    db_mod._engine = engine

    # Seed an authenticated user and make every request run as them.
    with Session(engine) as s:
        user = User(email="tester@example.com", password_hash=hash_password("password123"),
                    is_admin=False)
        s.add(user); s.commit(); s.refresh(user)
        user_id = user.id

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


@pytest.fixture
def anon_client():
    """No auth override: the real get_current_user dependency is active, so
    401/403 behaviour is tested for real."""
    from app import db as db_mod
    from app.main import app

    engine = _make_engine()
    _seed(engine)
    db_mod._engine = engine

    def _get_session():
        return Session(engine)

    app.dependency_overrides[db_mod.get_session] = _get_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    db_mod._engine = None
