"""Event bus feeding the StatusDock running log.

emit() pushes onto a capped Redis list so the log survives page reloads and is
shared between the api and worker processes. Falls back to an in-process ring
when Redis is unavailable so tests and no-redis runs still work.
"""
from __future__ import annotations

import json
import time
from collections import deque
from typing import Any, Literal

import redis

from app.config import get_settings

RING_KEY = "biblestudy:events"
RING_MAX = 500

Level = Literal["info", "success", "warn", "error"]

_fallback: deque[dict[str, Any]] = deque(maxlen=RING_MAX)
_client: redis.Redis | None = None
_client_tried = False


def _redis() -> redis.Redis | None:
    global _client, _client_tried
    if _client_tried:
        return _client
    _client_tried = True
    try:
        c = redis.from_url(get_settings().redis_url, decode_responses=True)
        c.ping()
        _client = c
    except Exception:
        _client = None
    return _client


def emit(
    level: Level,
    scope: str,
    message: str,
    *,
    cost_usd: float | None = None,
    study_id: int | None = None,
    progress: int | None = None,
) -> dict[str, Any]:
    """Record one activity-log entry. Never raises - logging must not break work."""
    event = {
        "ts": time.time(),
        "level": level,
        "scope": scope,
        "message": message,
        "cost_usd": cost_usd,
        "study_id": study_id,
        "progress": progress,
    }
    payload = json.dumps(event)
    client = _redis()
    if client is not None:
        try:
            pipe = client.pipeline()
            pipe.rpush(RING_KEY, payload)
            pipe.ltrim(RING_KEY, -RING_MAX, -1)
            pipe.execute()
            return event
        except Exception:
            pass
    _fallback.append(event)
    return event


def recent(limit: int = 200) -> list[dict[str, Any]]:
    """Newest-last list of recent events."""
    limit = max(1, min(limit, RING_MAX))
    client = _redis()
    if client is not None:
        try:
            raw = client.lrange(RING_KEY, -limit, -1)
            return [json.loads(r) for r in raw]
        except Exception:
            pass
    return list(_fallback)[-limit:]


def clear() -> None:
    client = _redis()
    if client is not None:
        try:
            client.delete(RING_KEY)
        except Exception:
            pass
    _fallback.clear()


def _reset_client_for_tests() -> None:
    global _client, _client_tried
    _client, _client_tried = None, False
