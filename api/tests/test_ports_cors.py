"""Ports & CORS must stay in sync.

Regression guard: CORS was once hard-coded to :5173. When the stack moved to
8420 the browser silently blocked every request and the UI showed a dead API
with no JS error - only the dock's red cross revealed it.
"""
import importlib
import sys

from fastapi.testclient import TestClient


def _reload_app(monkeypatch, web_port: str):
    monkeypatch.setenv("WEB_PORT", web_port)
    for mod in ("app.config.settings", "app.config", "app.main"):
        sys.modules.pop(mod, None)
    import app.config.settings as s
    s.get_settings.cache_clear()
    return importlib.import_module("app.main").app


def test_cors_allows_the_configured_web_port(monkeypatch):
    app = _reload_app(monkeypatch, "8420")
    client = TestClient(app)
    r = client.get("/api/meta", headers={"Origin": "http://localhost:8420"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:8420"


def test_cors_follows_a_port_change(monkeypatch):
    """Move WEB_PORT and CORS must move with it - no hard-coded 5173."""
    app = _reload_app(monkeypatch, "9137")
    client = TestClient(app)
    r = client.get("/api/meta", headers={"Origin": "http://localhost:9137"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:9137"

    stale = client.get("/api/meta", headers={"Origin": "http://localhost:5173"})
    assert stale.headers.get("access-control-allow-origin") != "http://localhost:5173"


def test_preflight_succeeds_from_configured_origin(monkeypatch):
    app = _reload_app(monkeypatch, "8420")
    client = TestClient(app)
    r = client.options(
        "/api/bible/translations",
        headers={
            "Origin": "http://localhost:8420",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:8420"
