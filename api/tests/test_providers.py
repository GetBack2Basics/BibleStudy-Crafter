"""Task 9: provider registry loads, validates, and degrades to free-only."""
import pytest

from app.config.providers import get_registry, load_registry


def test_registry_loads_and_validates():
    reg = load_registry()
    assert reg.text_chain[0] == "openrouter_free"
    assert {p.name for p in reg.text} >= {"openrouter_free", "ollama", "gemini_free"}
    for p in reg.text + reg.image + reg.audio:
        assert p.models, f"{p.name} has no models"
        assert p.tier in {"free", "paid"}
        assert p.label


def test_free_providers_cost_nothing():
    reg = load_registry()
    for p in reg.text:
        if p.is_free:
            assert p.cost_per_1k_in == 0.0 and p.cost_per_1k_out == 0.0


def test_ollama_available_without_any_key(monkeypatch):
    """The offline fallback must never depend on an API key."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    from app.config import settings as s
    s.get_settings.cache_clear()

    reg = load_registry()
    ollama = reg.get("text", "ollama")
    assert ollama.env_key is None
    assert ollama.is_available() is True


def test_no_keys_leaves_only_keyless_providers(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("FAL_KEY", "")
    monkeypatch.setenv("REPLICATE_API_TOKEN", "")
    from app.config import settings as s
    s.get_settings.cache_clear()

    reg = load_registry()
    text = [p.name for p in reg.available_chain("text")]
    assert text == ["ollama"]                       # only the keyless one survives
    assert reg.available_chain("image") == []       # all image providers need keys
    assert [p.name for p in reg.available_chain("audio")] == ["edge_tts"]


def test_key_presence_enables_provider(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-123")
    from app.config import settings as s
    from app.config.providers import get_registry
    s.get_settings.cache_clear()
    get_registry.cache_clear()

    reg = load_registry()
    names = [p.name for p in reg.available_chain("text")]
    assert "openrouter_free" in names
    assert names[0] == "openrouter_free"            # chain order preserved


def test_tier_filter_excludes_paid(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-123")
    from app.config import settings as s
    s.get_settings.cache_clear()

    reg = load_registry()
    assert all(p.is_free for p in reg.available_chain("text", tier="free"))


@pytest.mark.parametrize("bad,err", [
    ({"text": {"chain": ["x"], "providers": {"x": {"kind": "nope", "tier": "free",
                                                   "models": [{"id": "m"}]}}}}, "unknown kind"),
    ({"text": {"chain": ["x"], "providers": {"x": {"kind": "ollama", "tier": "cheap",
                                                   "models": [{"id": "m"}]}}}}, "unknown tier"),
    ({"text": {"chain": ["x"], "providers": {"x": {"kind": "ollama", "tier": "free",
                                                   "models": []}}}}, "no models"),
    ({"text": {"chain": ["ghost"], "providers": {}}}, "unknown provider"),
])
def test_invalid_config_is_rejected(tmp_path, bad, err):
    import yaml
    p = tmp_path / "bad.yaml"
    p.write_text(yaml.safe_dump(bad), encoding="utf-8")
    with pytest.raises(ValueError, match=err):
        load_registry(p)


def test_registry_is_cached():
    assert get_registry() is get_registry()
