"""Shared pytest fixtures (in-memory SQLite + TestClient)."""
import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool


@pytest.fixture
def client():
    from app import db as db_mod
    from app.main import app

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    from app.models import Translation, Verse
    with Session(engine) as s:
        tr = Translation(code="KJV", source_id="eng_kjv", name="KJV")
        s.add(tr); s.commit(); s.refresh(tr)
        s.add(Verse(translation_id=tr.id, book_number=40, chapter=6, verse=14,
                    text="For if you forgive others their trespasses"))
        s.add(Verse(translation_id=tr.id, book_number=40, chapter=6, verse=15,
                    text="but if you do not forgive others their trespasses"))
        s.commit()
    db_mod._engine = engine

    def _get_session():
        return Session(engine)

    app.dependency_overrides[db_mod.get_session] = _get_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    db_mod._engine = None
