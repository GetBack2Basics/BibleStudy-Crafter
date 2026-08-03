"""Provider registry loaded from providers.yaml.

A provider is *available* only when its env_key is set (or it needs no key).
That single rule is what lets the app run end-to-end with an empty .env:
paid providers simply vanish from the chain instead of raising.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

from app.config.settings import get_settings

REGISTRY_PATH = Path(__file__).parent / "providers.yaml"
VALID_KINDS = {"openai_compatible", "gemini", "ollama", "fal", "replicate", "edge_tts"}
VALID_TIERS = {"free", "paid"}


@dataclass(frozen=True)
class Model:
    id: str
    label: str
    context: int = 0
    cost_per_call: float = 0.0


@dataclass(frozen=True)
class Provider:
    name: str
    label: str
    kind: str
    tier: str
    env_key: str | None = None
    base_url: str = ""
    base_url_setting: str | None = None
    cost_per_1k_in: float = 0.0
    cost_per_1k_out: float = 0.0
    models: tuple[Model, ...] = field(default_factory=tuple)

    @property
    def is_free(self) -> bool:
        return self.tier == "free"

    def api_key(self) -> str:
        """Resolve the provider's API key.

        Real environment variables win (that's how Docker Compose injects them,
        and how pytest's monkeypatch sets them), with a fallback to pydantic's
        settings so a key placed only in .env still works in plain `python` runs.
        Reading os.environ directly keeps the result correct regardless of the
        get_settings() lru_cache, which otherwise serves stale values when a test
        mutates the environment after the cache is warm.
        """
        if not self.env_key:
            return ""
        import os
        direct = os.environ.get(self.env_key)
        if direct:
            return direct
        return getattr(get_settings(), self.env_key.lower(), "") or ""

    def resolved_base_url(self) -> str:
        if self.base_url_setting:
            return getattr(get_settings(), self.base_url_setting, "") or ""
        return self.base_url

    def is_available(self) -> bool:
        """No key required -> available. Key required -> only if it is set."""
        if self.env_key is None:
            return True
        return bool(self.api_key())

    def default_model(self) -> Model:
        if not self.models:
            raise ValueError(f"provider {self.name} declares no models")
        return self.models[0]


@dataclass(frozen=True)
class Registry:
    text: tuple[Provider, ...]
    image: tuple[Provider, ...]
    audio: tuple[Provider, ...]
    text_chain: tuple[str, ...]
    image_chain: tuple[str, ...]
    audio_chain: tuple[str, ...]

    def _group(self, capability: str) -> tuple[Provider, ...]:
        return {"text": self.text, "image": self.image, "audio": self.audio}[capability]

    def get(self, capability: str, name: str) -> Provider | None:
        return next((p for p in self._group(capability) if p.name == name), None)

    def chain(self, capability: str) -> tuple[str, ...]:
        return {
            "text": self.text_chain,
            "image": self.image_chain,
            "audio": self.audio_chain,
        }[capability]

    def available_chain(self, capability: str, tier: str | None = None) -> list[Provider]:
        """Providers from the configured chain that can actually be used now."""
        out: list[Provider] = []
        for name in self.chain(capability):
            provider = self.get(capability, name)
            if provider is None or not provider.is_available():
                continue
            if tier == "free" and not provider.is_free:
                continue
            out.append(provider)
        return out


def _parse_models(raw: list[dict] | None) -> tuple[Model, ...]:
    return tuple(
        Model(
            id=m["id"],
            label=m.get("label", m["id"]),
            context=int(m.get("context", 0)),
            cost_per_call=float(m.get("cost_per_call", 0.0)),
        )
        for m in (raw or [])
    )


def _parse_group(section: dict, capability: str) -> tuple[tuple[Provider, ...], tuple[str, ...]]:
    providers: list[Provider] = []
    for name, raw in (section.get("providers") or {}).items():
        kind = raw.get("kind")
        tier = raw.get("tier")
        if kind not in VALID_KINDS:
            raise ValueError(f"{capability}.{name}: unknown kind {kind!r}")
        if tier not in VALID_TIERS:
            raise ValueError(f"{capability}.{name}: unknown tier {tier!r}")
        models = _parse_models(raw.get("models"))
        if not models:
            raise ValueError(f"{capability}.{name}: no models declared")
        providers.append(
            Provider(
                name=name,
                label=raw.get("label", name),
                kind=kind,
                tier=tier,
                env_key=raw.get("env_key"),
                base_url=raw.get("base_url", ""),
                base_url_setting=raw.get("base_url_setting"),
                cost_per_1k_in=float(raw.get("cost_per_1k_in", 0.0)),
                cost_per_1k_out=float(raw.get("cost_per_1k_out", 0.0)),
                models=models,
            )
        )

    chain = tuple(section.get("chain") or [])
    known = {p.name for p in providers}
    for name in chain:
        if name not in known:
            raise ValueError(f"{capability}.chain references unknown provider {name!r}")
    return tuple(providers), chain


def load_registry(path: Path | str = REGISTRY_PATH) -> Registry:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    text, text_chain = _parse_group(data.get("text") or {}, "text")
    image, image_chain = _parse_group(data.get("image") or {}, "image")
    audio, audio_chain = _parse_group(data.get("audio") or {}, "audio")
    return Registry(
        text=text, image=image, audio=audio,
        text_chain=text_chain, image_chain=image_chain, audio_chain=audio_chain,
    )


@lru_cache
def get_registry() -> Registry:
    return load_registry()
