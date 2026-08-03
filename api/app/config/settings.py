"""Application configuration.

Hard rule: the app MUST import and serve with an entirely empty .env.
Every provider key is optional; absence disables a feature, never boots-fails.
"""
from functools import lru_cache
from datetime import datetime, timezone
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Core
    database_url: str = "sqlite:///./bible.db"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "dev-insecure-key"
    media_root: str = "/media"
    bible_cache: str = "/bibles"

    # Budget
    monthly_budget_usd: float = 5.00

    # Text providers - all optional
    openrouter_api_key: str = ""
    gemini_api_key: str = ""
    anthropic_api_key: str = ""
    ollama_base_url: str = "http://host.docker.internal:11434"

    # Asset providers - all optional
    fal_key: str = ""
    replicate_api_token: str = ""

    # Study defaults
    default_tradition: str = "non_denominational"
    default_imagery_policy: str = "symbolic"

    @property
    def has_any_text_provider(self) -> bool:
        return bool(self.openrouter_api_key or self.gemini_api_key
                    or self.anthropic_api_key or self.ollama_base_url)

    @property
    def has_image_provider(self) -> bool:
        return bool(self.fal_key or self.replicate_api_token)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_build_stamp() -> str:
    """12-digit yyyymmddhhmm stamp baked in at image build time.

    /etc/build_stamp is used because the dev bind-mount (./api -> /app) would
    shadow anything written inside /app. BUILD_STAMP env var wins when set so
    tests and non-container runs can override.
    """
    import os

    env_stamp = os.environ.get("BUILD_STAMP", "").strip()
    if env_stamp and env_stamp != "dev":
        return env_stamp
    for candidate in (Path("/etc/build_stamp"),
                      Path(__file__).resolve().parents[2] / "BUILD_STAMP"):
        try:
            stamp = candidate.read_text(encoding="utf-8").strip()
            if stamp:
                return stamp
        except OSError:
            continue
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
