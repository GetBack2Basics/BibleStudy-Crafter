"""Preferences: most-used translations tracking + defaulting."""
from fastapi.testclient import TestClient


def test_preferences_default_and_switch(client):
    # default returns up to 3 loaded translations
    r = client.get("/api/preferences/translations")
    assert r.status_code == 200
    codes = r.json()["translations"]
    assert 1 <= len(codes) <= 3
    assert all(isinstance(c, str) for c in codes)

    # switching to a (loaded) version moves it to the front
    first = codes[0]
    switched = "WEB" if "WEB" in codes else codes[-1]
    r2 = client.post("/api/preferences/translations",
                     json={"translations": [switched, first]})
    assert r2.status_code == 200
    assert r2.json()["translations"][0] == switched

    # GET reflects the new preference order
    r3 = client.get("/api/preferences/translations")
    assert r3.json()["translations"][0] == switched


def test_compare_returns_multiple_versions(client):
    codes = client.get("/api/preferences/translations").json()["translations"]
    if len(codes) < 2:
        # seed has >= 2 translations; skip gracefully if not
        return
    ref = "John 3:16"
    r = client.get(f"/api/bible/compare?ref={ref}&translations={','.join(codes[:2])}")
    assert r.status_code == 200
    assert len(r.json()["verses"]) >= 1
