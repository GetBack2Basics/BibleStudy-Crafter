"""Light endpoint to fetch + strip a URL's visible text, for the inline
source reader. Reuses the same SSRF guard + text extraction that the
discussions service uses, so we do not re-invent or weaken the guard.

GET /api/studies/{study_id}/days/{day}/sources/{encoded_url}/text
  -> {title, text, source}
"""
from __future__ import annotations

import base64
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import get_current_user
from app.db import get_session
from app.models import Study, StudyDay, User

router = APIRouter(prefix="/api/studies", tags=["sources"])

# Borrow the same helpers the discussions service already uses.
from app.services.discussions import _is_safe_url, _strip_tags_to_text


class SourceTextOut(BaseModel):
    title: str = ""
    text: str
    source: str = ""
    note: str = ""


def _study_day(session: Session, study_id: int, day_number: int, user: User):
    s = session.get(Study, study_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "study not found")
    d = next((x for x in s.days if x.day_number == day_number), None)
    if d is None:
        raise HTTPException(400, "day out of range")
    return s, d


def _decode_url(raw: str) -> str:
    """Accept a raw URL or an RFC-4648 base64url-encoded one.
    encoded params stay query-string safe (no special chars in the path segment)."""
    try:
        padded = raw + "=" * (-len(raw) % 4)
        decoded = base64.urlsafe_b64decode(padded).decode("utf-8", "replace")
        if decoded.startswith("http"):
            return decoded
    except Exception:
        pass
    return raw


@router.get("/sources/{encoded_url}/text", response_model=SourceTextOut,
            response_model_exclude_none=True)
def fetch_source_text(
        encoded_url: str,
        study_id: int | None = Query(default=None, ge=1, description="optional, for access guard"),
        day_number: int | None = Query(default=None, ge=1, description="optional, for access guard"),
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Fetch a URL's visible text for reading inline. Public-ish per-user gating:
    when study_id + day_number are supplied, enforce ownership; when absent,
    anyone with a valid session may read a source (used by the day-detail reader)."""
    url = _decode_url(encoded_url)
    if not _is_safe_url(url):
        raise HTTPException(400, "unsafe url")

    # Optional ownership guard — allows the endpoint to be called standalone too.
    if study_id is not None and day_number is not None:
        _, _ = _study_day(session, study_id, day_number, user)

    title, text = "", ""
    try:
        import httpx
        with httpx.Client(timeout=12.0, follow_redirects=True,
                          headers={"User-Agent": "BibleStudy-Crafter/0.1"}) as c:
            resp = c.get(url)
            resp.raise_for_status()
            raw = resp.text
            title = ""
            meta = "title" if "title" in raw.lower() else ""
            # Best-effort title from <title> if present.
            import re
            m = re.search(r"<title[^>]*>(.*?)</title>", raw, re.S | re.I)
            if m:
                title = _strip_tags_to_text(m.group(1)).strip()[:160]
            text = _strip_tags_to_text(raw)[:8000]
            # Source label = host; mirrors what discussions.py does.
            from urllib.parse import urlparse
            host = urlparse(url).netloc.lower()
            source = host[4:] if host.startswith("www.") else host
    except Exception as exc:
        raise HTTPException(502, f"could not load source: {exc}")

    return {"title": title, "text": text, "source": source, "note": ""}
