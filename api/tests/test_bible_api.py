"""Task 8: /api/bible endpoints against a seeded SQLite test DB (no network)."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session
from app.main import app
from app.models import Translation, Verse

KJV_316 = ("For God so loved the world, that he gave his only begotten Son, "
           "that whosoever believeth in him should not perish, but have everlasting life.")
WEB_316 = ("For God so loved the world, that he gave his one and only Son, that "
           "whoever believes in him should not perish, but have eternal life.")


@pytest.fixture(name="client")
def client_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,   # one shared in-memory DB across connections
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as s:
        kjv = Translation(code="KJV", source_id="eng_kjv", name="King James Version",
                          license_url="https://ebible.org/", verse_count=3)
        web = Translation(code="WEB", source_id="ENGWEBP", name="World English Bible",
                          license_url="https://ebible.org/", verse_count=2)
        s.add(kjv); s.add(web); s.commit(); s.refresh(kjv); s.refresh(web)

        s.add_all([
            Verse(translation_id=kjv.id, book_number=43, chapter=3, verse=16, text=KJV_316),
            Verse(translation_id=kjv.id, book_number=43, chapter=3, verse=17,
                  text="For God sent not his Son into the world to condemn the world."),
            Verse(translation_id=kjv.id, book_number=43, chapter=3, verse=18,
                  text="He that believeth on him is not condemned."),
            Verse(translation_id=web.id, book_number=43, chapter=3, verse=16, text=WEB_316),
            Verse(translation_id=web.id, book_number=43, chapter=3, verse=17,
                  text="For God didn't send his Son into the world to judge the world."),
        ])
        s.commit()

    def override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_translations_includes_licence(client):
    body = client.get("/api/bible/translations").json()
    codes = {t["code"] for t in body["translations"]}
    assert codes == {"KJV", "WEB"}
    assert all(t["license_url"] for t in body["translations"])


def test_passage_returns_db_text(client):
    body = client.get("/api/bible/passage", params={"ref": "John 3:16-18",
                                                    "translation": "KJV"}).json()
    assert body["ref"] == "John 3:16-18"
    assert body["book"] == "John"
    assert [v["verse"] for v in body["verses"]] == [16, 17, 18]
    assert body["verses"][0]["text"] == KJV_316


def test_compare_is_verse_aligned(client):
    body = client.get("/api/bible/compare", params={"ref": "John 3:16-17",
                                                    "translations": "KJV,WEB"}).json()
    assert [v["verse"] for v in body["verses"]] == [16, 17]
    row16 = body["verses"][0]["texts"]
    assert row16["KJV"] == KJV_316
    assert row16["WEB"] == WEB_316
    assert row16["KJV"] != row16["WEB"]


def test_compare_marks_unloaded_translation(client):
    body = client.get("/api/bible/compare", params={"ref": "John 3:16",
                                                    "translations": "KJV,NIV"}).json()
    loaded = {t["code"]: t["loaded"] for t in body["translations"]}
    assert loaded["KJV"] is True
    assert loaded["NIV"] is False


def test_bad_reference_is_400(client):
    assert client.get("/api/bible/passage", params={"ref": "Hezekiah 3:1"}).status_code == 400


def test_missing_translation_is_404(client):
    r = client.get("/api/bible/passage", params={"ref": "John 3:16", "translation": "NIV"})
    assert r.status_code == 404
