"""Meta + events routes: build stamp and the running activity log."""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import time

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.config import get_build_stamp, get_settings
from app.services import events

router = APIRouter(tags=["meta"])

STARTED_AT = time.time()
VERSION = "0.1.0"


def _git_sha() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=2, cwd=os.path.dirname(__file__),
        )
        return out.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/api/meta")
def meta() -> dict:
    s = get_settings()
    return {
        "build_stamp": get_build_stamp(),
        "git_sha": _git_sha(),
        "started_at": STARTED_AT,
        "version": VERSION,
        "providers": {
            "text": bool(s.openrouter_api_key or s.gemini_api_key or s.anthropic_api_key),
            "ollama": bool(s.ollama_base_url),
            "image": s.has_image_provider,
        },
        "budget_cap_usd": s.monthly_budget_usd,
        "auth": {
            "google_enabled": bool(s.google_client_id),
            "google_client_id": s.google_client_id or None,
        },
    }


@router.get("/api/events/recent")
def events_recent(limit: int = 200) -> dict:
    return {"events": events.recent(limit)}


@router.get("/api/events")
async def events_stream():
    """SSE stream: replay the buffer, then tail new entries reliably."""
    async def generator():
        backlog = events.recent(200)
        last_id = 0
        for ev in backlog:
            ev_id = ev.get("id", 0)
            if ev_id > last_id:
                last_id = ev_id
            yield {"event": "log", "data": json.dumps(ev)}

        last_beat = time.time()
        while True:
            await asyncio.sleep(0.5)
            # Fetch any items with id > last_id
            new_events = events.recent(100, after_id=last_id)
            if new_events:
                for ev in new_events:
                    ev_id = ev.get("id", 0)
                    if ev_id > last_id:
                        last_id = ev_id
                    yield {"event": "log", "data": json.dumps(ev)}

            if time.time() - last_beat > 15:
                last_beat = time.time()
                yield {"event": "heartbeat", "data": json.dumps({"ts": last_beat})}

    return EventSourceResponse(generator())
