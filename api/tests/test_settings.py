"""Task 3: the free-by-default contract, and Task 3b: build stamp."""
import re

from fastapi.testclient import TestClient


def test_app_boots_with_no_api_keys(monkeypatch):
    """The app must import and serve /health with every provider key empty."""
    for key in ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY",
                "FAL_KEY", "REPLICATE_API_TOKEN"):
        monkeypatch.setenv(key, "")

    from app.config import get_settings
    get_settings.cache_clear()

    from app.main import app
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_no_keys_means_no_image_provider(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "")
    monkeypatch.setenv("REPLICATE_API_TOKEN", "")
    from app.config import get_settings
    get_settings.cache_clear()
    assert get_settings().has_image_provider is False


def test_meta_returns_12_digit_stamp():
    from app.main import app
    client = TestClient(app)
    body = client.get("/api/meta").json()
    assert re.fullmatch(r"\d{12}", body["build_stamp"]), body["build_stamp"]
    assert body["version"]
