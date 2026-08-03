"""Task 10: failover, NoProviderAvailable, and JSON repair - all with a mocked transport."""
import json
from unittest.mock import patch

import httpx
import pytest

from app.services import llm
from app.services.llm import LLMResult, NoProviderAvailable


def _make_result(text, model="llama3.1:8b", provider="ollama"):
    return LLMResult(text=text, provider=provider, model=model,
                     tokens_in=10, tokens_out=20, cost_usd=0.0)


async def _tup(text, tin=10, tout=20):
    return (text, tin, tout)


def _make_transport(status, text="ok"):
    """Build a fake transport that raises on non-2xx, else returns (text,tin,tout)."""
    async def _t(*a, **k):
        req = httpx.Request("POST", "http://x/chat")
        resp = httpx.Response(status, json={"choices": [{"message": {"content": text}}]},
                              request=req)
        if status >= 400:
            resp.raise_for_status()
        return (text, 10, 20)
    return _t


async def test_first_provider_429_then_second_succeeds():
    transports = {
        "openrouter_free": _make_transport(429, "from free pool"),
        "ollama": lambda *a, **k: _tup("from ollama"),
    }
    with patch.object(llm, "_TRANSPORTS", transports), \
         patch("app.services.llm.get_registry") as reg:
        reg.return_value.available_chain.return_value = [
            _prov("openrouter_free", "openai_compatible", has_key=True),
            _prov("ollama", "ollama", has_key=False),
        ]
        res = await llm.complete("hi", system="s", json_mode=False, tier="free")
    assert res.text == "from ollama"
    assert res.provider == "ollama"


async def test_all_providers_fail_raises_no_provider_available():
    transports = {
        "openrouter_free": _make_transport(429),
        "gemini_free": _make_transport(503),
        "ollama": _make_transport(500),
    }
    with patch.object(llm, "_TRANSPORTS", transports), \
         patch("app.services.llm.get_registry") as reg:
        reg.return_value.available_chain.return_value = [
            _prov("openrouter_free", "openai_compatible", has_key=True),
            _prov("gemini_free", "gemini", has_key=True),
            _prov("ollama", "ollama", has_key=False),
        ]
        with pytest.raises(NoProviderAvailable):
            await llm.complete("hi", system="s", tier="free")


async def test_no_configured_provider_raises_clearly():
    with patch("app.services.llm.get_registry") as reg:
        reg.return_value.available_chain.return_value = []   # no keys, no Ollama
        with pytest.raises(NoProviderAvailable, match="No text provider"):
            await llm.complete("hi")


async def test_malformed_json_is_repaired_on_retry():
    good = json.dumps({"title": "Forgiveness", "days": []})
    call = {"n": 0}

    async def transport(*a, **k):
        call["n"] += 1
        if call["n"] == 1:
            return ("I can't format this properly: {title: 'Forgiveness', days: [}", 10, 20)
        return (good, 10, 15)

    with patch.object(llm, "_TRANSPORTS", {"ollama": transport}), \
         patch("app.services.llm.get_registry") as reg:
        reg.return_value.available_chain.return_value = [_prov("ollama", "ollama")]
        res = await llm.complete("plan", system="s", json_mode=True, tier="free")
    assert res.data == {"title": "Forgiveness", "days": []}
    assert call["n"] == 2          # exactly one repair retry


async def test_unrepairable_json_raises():
    async def transport(*a, **k):
        return ("definitely not json {{{", 10, 5)

    with patch.object(llm, "_TRANSPORTS", {"ollama": transport}), \
         patch("app.services.llm.get_registry") as reg:
        reg.return_value.available_chain.return_value = [_prov("ollama", "ollama")]
        with pytest.raises(llm.InvalidJSONResponse):
            await llm.complete("plan", system="s", json_mode=True)


async def test_usage_ledger_written_for_free_tier():
    from sqlmodel import Session, SQLModel, create_engine
    from sqlalchemy.pool import StaticPool
    from app.models import UsageLedger

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as s:
        with patch.object(llm, "_TRANSPORTS",
                          {"ollama": lambda *a, **k: _tup("hi", 10, 5)}), \
             patch("app.services.llm.get_registry") as reg:
            reg.return_value.available_chain.return_value = [_prov("ollama", "ollama")]
            res = await llm.complete("hi", system="s", session=s, study_id=7)
        rows = s.query(UsageLedger).all()
    assert len(rows) == 1
    assert rows[0].provider == "ollama"
    assert rows[0].study_id == 7
    assert rows[0].cost_usd == 0.0     # free tier records 0, not omitted


def _prov(name, kind, has_key=False):
    from app.config.providers import Provider
    return Provider(name=name, label=name, kind=kind, tier="free",
                    env_key=("X" if has_key else None),
                    base_url="http://x", models=[_model()])


def _model():
    from app.config.providers import Model
    return Model(id="m", label="m", context=4096)
