"""Unified LLM client with provider failover.

complete() walks the configured chain, skipping providers whose key is absent
and failing over on rate limits, payment errors and timeouts. Every attempt is
logged to the StatusDock; every success writes a UsageLedger row.
"""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.config.providers import Model, Provider, get_registry
from app.services import events

# Status codes that mean "this provider can't serve us, try the next one"
FAILOVER_STATUS = {402, 408, 429, 500, 502, 503, 504}
DEFAULT_TIMEOUT = 120.0
# Retry a provider this many times on transient failures (rate limits, 502s
# from the free tier) before failing over to the next provider in the chain.
MAX_ATTEMPTS = 3
RETRY_BACKOFF = 2.0  # seconds between retries


class NoProviderAvailable(RuntimeError):
    """No provider in the chain could serve the request."""


class InvalidJSONResponse(ValueError):
    """The model returned JSON that could not be parsed or repaired."""


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    cost_usd: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    data: Any = None          # parsed JSON when json_mode was requested


def _estimate_tokens(text: str) -> int:
    """Rough 4-chars-per-token estimate; only used when the API omits usage."""
    return max(1, len(text) // 4)


def _cost(provider: Provider, tokens_in: int, tokens_out: int) -> float:
    if provider.is_free:
        return 0.0
    return round(
        (tokens_in / 1000.0) * provider.cost_per_1k_in
        + (tokens_out / 1000.0) * provider.cost_per_1k_out,
        6,
    )


def extract_json(raw: str) -> Any:
    """Pull a JSON object out of a model response.

    Models routinely wrap JSON in prose or ```json fences even when told not
    to, so try progressively more forgiving strategies before giving up.
    """
    text = (raw or "").strip()
    if not text:
        raise InvalidJSONResponse("empty response")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass

    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    start, end = text.find("["), text.rfind("]")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise InvalidJSONResponse(f"could not parse JSON from: {text[:200]}")


# --------------------------------------------------------------- transports

async def _call_openai_compatible(client: httpx.AsyncClient, provider: Provider,
                                  model: Model, system: str, prompt: str,
                                  json_mode: bool, temperature: float) -> tuple[str, int, int]:
    payload: dict[str, Any] = {
        "model": model.id,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": prompt}],
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    resp = await client.post(
        f"{provider.resolved_base_url()}/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {provider.api_key()}",
                 "HTTP-Referer": "http://localhost",
                 "X-Title": "BibleStudy-Crafter"},
        timeout=DEFAULT_TIMEOUT,
    )
    resp.raise_for_status()
    body = resp.json()
    text = body["choices"][0]["message"]["content"]
    usage = body.get("usage") or {}
    return (text,
            int(usage.get("prompt_tokens") or _estimate_tokens(system + prompt)),
            int(usage.get("completion_tokens") or _estimate_tokens(text)))


async def _call_gemini(client: httpx.AsyncClient, provider: Provider, model: Model,
                       system: str, prompt: str, json_mode: bool,
                       temperature: float) -> tuple[str, int, int]:
    gen: dict[str, Any] = {"temperature": temperature}
    if json_mode:
        gen["responseMimeType"] = "application/json"

    resp = await client.post(
        f"{provider.resolved_base_url()}/models/{model.id}:generateContent",
        params={"key": provider.api_key()},
        json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": gen,
        },
        timeout=DEFAULT_TIMEOUT,
    )
    resp.raise_for_status()
    body = resp.json()
    text = body["candidates"][0]["content"]["parts"][0]["text"]
    usage = body.get("usageMetadata") or {}
    return (text,
            int(usage.get("promptTokenCount") or _estimate_tokens(system + prompt)),
            int(usage.get("candidatesTokenCount") or _estimate_tokens(text)))


async def _call_ollama(client: httpx.AsyncClient, provider: Provider, model: Model,
                       system: str, prompt: str, json_mode: bool,
                       temperature: float) -> tuple[str, int, int]:
    payload: dict[str, Any] = {
        "model": model.id,
        "system": system,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature},
    }
    if json_mode:
        payload["format"] = "json"

    resp = await client.post(f"{provider.resolved_base_url()}/api/generate",
                             json=payload, timeout=DEFAULT_TIMEOUT)
    resp.raise_for_status()
    body = resp.json()
    text = body.get("response", "")
    return (text,
            int(body.get("prompt_eval_count") or _estimate_tokens(system + prompt)),
            int(body.get("eval_count") or _estimate_tokens(text)))


_TRANSPORTS = {
    "openai_compatible": _call_openai_compatible,
    "gemini": _call_gemini,
    "ollama": _call_ollama,
}


# ------------------------------------------------------------------- public

async def complete(
    prompt: str,
    *,
    system: str = "",
    json_mode: bool = False,
    tier: str = "free",
    temperature: float = 0.7,
    study_id: int | None = None,
    session=None,
) -> LLMResult:
    """Run a completion against the first provider in the chain that works."""
    registry = get_registry()
    chain = registry.available_chain("text", tier=tier if tier == "free" else None)
    if not chain:
        events.emit("error", "llm", "No text provider available - set a key or run Ollama")
        raise NoProviderAvailable(
            "No text provider is configured. Add OPENROUTER_API_KEY or GEMINI_API_KEY "
            "to .env, or run Ollama locally."
        )

    errors: list[str] = []
    async with httpx.AsyncClient() as client:
        for provider in chain:
            transport = _TRANSPORTS.get(provider.kind)
            if transport is None:
                continue
            model = provider.default_model()
            ok = False
            for attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    text, tin, tout = await transport(
                        client, provider, model, system, prompt, json_mode, temperature
                    )
                    ok = True
                    break  # success - leave the retry loop
                except httpx.HTTPStatusError as exc:
                    code = exc.response.status_code
                    errors.append(f"{provider.name}: HTTP {code}")
                    if code in FAILOVER_STATUS and attempt < MAX_ATTEMPTS:
                        events.emit("warn", "llm",
                                    f"{provider.label} returned {code}, retry "
                                    f"{attempt}/{MAX_ATTEMPTS}")
                        await asyncio.sleep(RETRY_BACKOFF * attempt)
                        continue
                    events.emit("warn", "llm",
                                f"{provider.label} returned {code}, failing over")
                    errors.append(f"{provider.name}: HTTP {code} (exhausted)")
                    break  # exhausted this provider -> next provider
                except (httpx.TimeoutException, httpx.TransportError) as exc:
                    errors.append(f"{provider.name}: {type(exc).__name__}")
                    if attempt < MAX_ATTEMPTS:
                        events.emit("warn", "llm",
                                    f"{provider.label} unreachable "
                                    f"({type(exc).__name__}), retry {attempt}/{MAX_ATTEMPTS}")
                        await asyncio.sleep(RETRY_BACKOFF * attempt)
                        continue
                    events.emit("warn", "llm",
                                f"{provider.label} unreachable ({type(exc).__name__}), "
                                f"failing over")
                    break  # exhausted this provider -> next provider
            if not ok:
                continue  # try the next provider in the chain

            cost = _cost(provider, tin, tout)
            result = LLMResult(text=text, provider=provider.name, model=model.id,
                               cost_usd=cost, tokens_in=tin, tokens_out=tout)

            if json_mode:
                try:
                    result.data = extract_json(text)
                except InvalidJSONResponse:
                    repaired = await _repair_json(client, provider, model, system,
                                                  prompt, text, temperature)
                    result.data = repaired.data
                    result.text = repaired.text
                    result.tokens_out += repaired.tokens_out
                    result.cost_usd += repaired.cost_usd

            _record_usage(session, provider, model, result, study_id)
            events.emit("success", "llm",
                        f"{provider.label} / {model.label} ok "
                        f"({tin}+{tout} tok)", cost_usd=cost)
            return result

    events.emit("error", "llm", "All text providers failed: " + "; ".join(errors))
    raise NoProviderAvailable("All providers failed: " + "; ".join(errors))


async def _repair_json(client: httpx.AsyncClient, provider: Provider, model: Model,
                       system: str, original_prompt: str, broken: str,
                       temperature: float) -> LLMResult:
    """One retry with an explicit repair instruction before giving up."""
    events.emit("warn", "llm", "Malformed JSON, attempting one repair retry")
    repair_prompt = (
        "Your previous reply was not valid JSON. Return ONLY the corrected JSON "
        "object, with no commentary, explanation or markdown fences.\n\n"
        f"Previous reply:\n{broken[:4000]}"
    )
    transport = _TRANSPORTS[provider.kind]
    text, tin, tout = await transport(client, provider, model, system,
                                      repair_prompt, True, temperature)
    data = extract_json(text)     # raises InvalidJSONResponse if still broken
    events.emit("success", "llm", "JSON repaired on retry")
    return LLMResult(text=text, provider=provider.name, model=model.id,
                     cost_usd=_cost(provider, tin, tout),
                     tokens_in=tin, tokens_out=tout, data=data)


def _record_usage(session, provider: Provider, model: Model,
                  result: LLMResult, study_id: int | None) -> None:
    if session is None:
        return
    from app.models import UsageLedger
    try:
        session.add(UsageLedger(
            job_kind="text", provider=provider.name, model=model.id,
            cost_usd=result.cost_usd, study_id=study_id,
        ))
        session.commit()
    except Exception:            # noqa: BLE001 - telemetry must never break a job
        session.rollback()
