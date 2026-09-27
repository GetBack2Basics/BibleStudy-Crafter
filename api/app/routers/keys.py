"""BYOK (Bring Your Own Key) & Provider Settings Router.

Patterned after LivePersonaCrafter:
  - Supports Free Tier Default (zero configuration needed)
  - Allows users to bring their own API keys for OpenRouter, Gemini, Anthropic, Fal.ai, etc.
  - Test Connection endpoint for verifying keys in real-time.
"""
from __future__ import annotations

import time
from typing import Any, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.config import get_settings
from app.config.providers import get_registry
from app.db import get_session
from app.models import Setting, User
from app.services import events

router = APIRouter(prefix="/api/keys", tags=["keys-byok"])

SETTING_KEY = "byok_api_keys"


class KeyStatusOut(BaseModel):
    use_custom_keys: bool = False
    preferred_provider: str = "auto"
    has_openrouter: bool = False
    has_gemini: bool = False
    has_anthropic: bool = False
    has_fal: bool = False
    has_replicate: bool = False
    masked_keys: dict[str, str] = {}
    server_free_providers: list[str] = []


class KeySettingsIn(BaseModel):
    use_custom_keys: bool = False
    preferred_provider: str = "auto"
    openrouter_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    fal_key: Optional[str] = None
    replicate_api_token: Optional[str] = None


class TestKeyIn(BaseModel):
    provider: str  # "gemini" | "openrouter" | "anthropic"
    api_key: str


class TestKeyOut(BaseModel):
    success: bool
    latency_ms: int = 0
    message: str = ""
    error: Optional[str] = None


def _mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return "****" if key else ""
    return f"{key[:6]}...{key[-4:]}"


def get_user_keys(session: Session, user_id: int | None) -> dict[str, Any]:
    if user_id is None:
        return {}
    row = session.exec(
        select(Setting).where(Setting.key == SETTING_KEY, Setting.user_id == user_id)
    ).first()
    if row and isinstance(row.value_json, dict):
        return row.value_json
    return {}


@router.get("/status", response_model=KeyStatusOut)
def get_key_status(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> KeyStatusOut:
    data = get_user_keys(session, user.id)
    openrouter = data.get("openrouter_api_key") or ""
    gemini = data.get("gemini_api_key") or ""
    anthropic = data.get("anthropic_api_key") or ""
    fal = data.get("fal_key") or ""
    replicate = data.get("replicate_api_token") or ""

    masked = {}
    if openrouter:
        masked["openrouter"] = _mask_key(openrouter)
    if gemini:
        masked["gemini"] = _mask_key(gemini)
    if anthropic:
        masked["anthropic"] = _mask_key(anthropic)
    if fal:
        masked["fal"] = _mask_key(fal)
    if replicate:
        masked["replicate"] = _mask_key(replicate)

    registry = get_registry()
    free_available = [p.name for p in registry.available_chain("text", tier="free")]

    return KeyStatusOut(
        use_custom_keys=bool(data.get("use_custom_keys", False)),
        preferred_provider=str(data.get("preferred_provider", "auto")),
        has_openrouter=bool(openrouter),
        has_gemini=bool(gemini),
        has_anthropic=bool(anthropic),
        has_fal=bool(fal),
        has_replicate=bool(replicate),
        masked_keys=masked,
        server_free_providers=free_available,
    )


@router.post("/settings", response_model=KeyStatusOut)
def save_key_settings(
    body: KeySettingsIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> KeyStatusOut:
    current = get_user_keys(session, user.id)
    updated = dict(current)

    updated["preferred_provider"] = body.preferred_provider

    if body.openrouter_api_key is not None:
        k = body.openrouter_api_key.strip()
        if k == "" or k.startswith("****"):
            if k == "":
                updated.pop("openrouter_api_key", None)
        else:
            updated["openrouter_api_key"] = k

    if body.gemini_api_key is not None:
        k = body.gemini_api_key.strip()
        if k == "" or k.startswith("****"):
            if k == "":
                updated.pop("gemini_api_key", None)
        else:
            updated["gemini_api_key"] = k

    if body.anthropic_api_key is not None:
        k = body.anthropic_api_key.strip()
        if k == "" or k.startswith("****"):
            if k == "":
                updated.pop("anthropic_api_key", None)
        else:
            updated["anthropic_api_key"] = k

    if body.fal_key is not None:
        k = body.fal_key.strip()
        if k == "" or k.startswith("****"):
            if k == "":
                updated.pop("fal_key", None)
        else:
            updated["fal_key"] = k

    if body.replicate_api_token is not None:
        k = body.replicate_api_token.strip()
        if k == "" or k.startswith("****"):
            if k == "":
                updated.pop("replicate_api_token", None)
        else:
            updated["replicate_api_token"] = k

    has_any_key = bool(
        updated.get("openrouter_api_key")
        or updated.get("gemini_api_key")
        or updated.get("anthropic_api_key")
        or updated.get("fal_key")
        or updated.get("replicate_api_token")
    )
    if body.use_custom_keys or has_any_key:
        updated["use_custom_keys"] = True
    else:
        updated["use_custom_keys"] = False

    row = session.exec(
        select(Setting).where(Setting.key == SETTING_KEY, Setting.user_id == user.id)
    ).first()
    if row is None:
        row = Setting(key=SETTING_KEY, user_id=user.id, value_json=updated, is_secret=True)
        session.add(row)
    else:
        row.value_json = updated
    session.commit()
    session.refresh(row)

    active_keys = [k.replace("_api_key", "").replace("_key", "").replace("_api_token", "")
                   for k, v in updated.items() if v and k.endswith(("_key", "_token", "_api_key"))]
    mode_text = "BYOK Mode active" if updated.get("use_custom_keys") else "Free Mode"
    events.emit("success", "byok", f"API keys updated: {mode_text} ({', '.join(active_keys) if active_keys else 'no keys'})")

    return get_key_status(user=user, session=session)


def _persist_user_key(session: Session, user_id: int, provider: str, key: str) -> None:
    current = get_user_keys(session, user_id)
    updated = dict(current)
    field_name = f"{provider}_api_key" if provider in ("gemini", "openrouter", "anthropic") else f"{provider}_key"
    updated[field_name] = key
    updated["use_custom_keys"] = True
    row = session.exec(
        select(Setting).where(Setting.key == SETTING_KEY, Setting.user_id == user_id)
    ).first()
    if row is None:
        row = Setting(key=SETTING_KEY, user_id=user_id, value_json=updated, is_secret=True)
        session.add(row)
    else:
        row.value_json = updated
    session.commit()


@router.post("/test", response_model=TestKeyOut)
async def test_api_key(
    body: TestKeyIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TestKeyOut:
    key = body.api_key.strip()
    if not key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="API key is required")
    
    provider = body.provider.lower()
    events.emit("info", "byok", f"Testing {provider.capitalize()} API key connection...")
    start_time = time.time()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider == "gemini":
                candidates = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash"]
                last_error = ""
                for model_id in candidates:
                    try:
                        resp = await client.post(
                            f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent",
                            params={"key": key},
                            json={"contents": [{"role": "user", "parts": [{"text": "ping"}]}]},
                        )
                        if resp.status_code == 200:
                            latency = int((time.time() - start_time) * 1000)
                            _persist_user_key(session, user.id, provider, key)
                            events.emit("success", "byok", f"Gemini API key verified with {model_id} & saved ({latency}ms)")
                            return TestKeyOut(success=True, latency_ms=latency, message=f"Gemini API key is valid ({model_id}) and saved!")
                        last_error = resp.json().get("error", {}).get("message", resp.text)
                    except Exception as e:
                        last_error = str(e)
                latency = int((time.time() - start_time) * 1000)
                events.emit("error", "byok", f"Gemini key verification failed: {last_error}")
                return TestKeyOut(success=False, latency_ms=latency, message="Gemini key validation failed", error=last_error)

            elif provider == "openrouter":
                resp = await client.get(
                    "https://openrouter.ai/api/v1/auth/key",
                    headers={"Authorization": f"Bearer {key}"},
                )
                latency = int((time.time() - start_time) * 1000)
                if resp.status_code == 200:
                    data = resp.json().get("data", {})
                    limit = data.get("limit") or "unlimited"
                    usage = data.get("usage", 0)
                    msg = f"OpenRouter key is valid! (Usage: ${usage:.2f}, Limit: {limit})"
                    _persist_user_key(session, user.id, provider, key)
                    events.emit("success", "byok", f"OpenRouter API key verified & saved to profile ({latency}ms) - Usage: ${usage:.2f}")
                    return TestKeyOut(
                        success=True,
                        latency_ms=latency,
                        message=msg,
                    )
                events.emit("error", "byok", f"OpenRouter API key is invalid: {resp.text}")
                return TestKeyOut(success=False, latency_ms=latency, message="OpenRouter key is invalid", error=resp.text)

            elif provider == "anthropic":
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-3-5-haiku-20241022",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "ping"}],
                    },
                )
                latency = int((time.time() - start_time) * 1000)
                if resp.status_code == 200:
                    _persist_user_key(session, user.id, provider, key)
                    events.emit("success", "byok", f"Anthropic API key verified & saved to profile ({latency}ms)")
                    return TestKeyOut(success=True, latency_ms=latency, message="Anthropic API key is valid and saved!")
                events.emit("error", "byok", f"Anthropic key verification failed: {resp.text}")
                return TestKeyOut(success=False, latency_ms=latency, message="Anthropic key validation failed", error=resp.text)

            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported provider: {provider}")

    except Exception as exc:
        latency = int((time.time() - start_time) * 1000)
        events.emit("error", "byok", f"{provider.capitalize()} connection failed: {exc}")
        return TestKeyOut(success=False, latency_ms=latency, message="Connection failed", error=str(exc))
