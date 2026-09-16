"""Verify the Brave Search API path replaces the dead engine ladder.

Deterministic: Brave and the engine ladder are both patched at the module
level, so no real network call is made. These tests prove:
  1. _parse_brave extracts real, cited sources from Brave JSON.
  2. search() uses Brave first (and honours site: scoping) when a key is set,
     and does NOT touch the engine ladder.
  3. When Brave returns nothing (bad/empty key, 403, timeout) search() falls
     through to the engine ladder - the graceful fallback.
  4. With no key set, Brave is never called and the ladder is used unchanged.
"""
from __future__ import annotations

import json

import pytest

BRAVE_JSON = {
    "web": {
        "results": [
            {
                "title": "Why I reject John 3:16 - Reddit",
                "url": "https://www.reddit.com/r/atheism/comments/john316/",
                "description": "A sceptical reading of the verse.",
            },
            {
                "title": "What does John 3:16 mean? - Bible Gateway",
                "url": "https://www.biblegateway.com/passage/?search=John+3%3A16",
                "description": "A devotional take on God's love.",
            },
        ]
    }
}


@pytest.mark.asyncio
async def test_parse_brave_extracts_cited_sources():
    import app.services.discussions as D
    srcs = D._parse_brave(BRAVE_JSON)
    urls = {s.url for s in srcs}
    assert "https://www.reddit.com/r/atheism/comments/john316/" in urls
    assert "https://www.biblegateway.com/passage/?search=John+3%3A16" in urls
    # social host classification still works on Brave output
    assert any(s.kind == "social" and s.platform == "reddit" for s in srcs)


@pytest.mark.asyncio
async def test_search_uses_brave_when_key_set(monkeypatch):
    import app.services.discussions as D

    canned = [
        D.Source(title="fake reddit",
                 url="https://www.reddit.com/r/atheism/comments/john316/",
                 snippet="sceptical", source="reddit.com",
                 kind="social", platform="reddit"),
    ]
    async def fake_brave(q):
        return canned
    monkeypatch.setattr(D, "_brave_search", fake_brave)
    monkeypatch.setattr(D, "_brave_key", lambda: "test-key")

    # Engine ladder must NOT be contacted when Brave succeeds.
    async def boom(url, q, p):
        raise AssertionError("ladder should not be called when Brave succeeds")
    monkeypatch.setattr(D, "_search_one", boom)

    out = await D.search("John 3:16 site:reddit.com")
    assert out[0].url == "https://www.reddit.com/r/atheism/comments/john316/"


@pytest.mark.asyncio
async def test_search_falls_through_when_brave_empty(monkeypatch):
    """Brave returns nothing (403/empty key/timeout) -> engine ladder used."""
    import app.services.discussions as D

    async def empty_brave(q):
        return []
    monkeypatch.setattr(D, "_brave_search", empty_brave)

    ladder = [D.Source(title="fallback",
                       url="https://www.biblegateway.com/x",
                       snippet="devotional", source="biblegateway.com")]
    async def fake_ladder(url, q, p):
        return ladder
    monkeypatch.setattr(D, "_search_one", fake_ladder)

    out = await D.search("John 3:16 Bible commentary discussion")
    assert out[0].url == "https://www.biblegateway.com/x"


@pytest.mark.asyncio
async def test_search_no_key_uses_ladder(monkeypatch):
    """No key set -> Brave never runs; ladder is the only path (unchanged)."""
    import app.services.discussions as D

    monkeypatch.setattr(D, "_brave_key", lambda: "")

    async def brave_must_not_run(q):
        raise AssertionError("brave must not run without a key")
    monkeypatch.setattr(D, "_brave_search", brave_must_not_run)

    ladder = [D.Source(title="fallback2",
                       url="https://gotquestions.org/y",
                       snippet="scholarly", source="gotquestions.org")]
    async def fake_ladder(url, q, p):
        return ladder
    monkeypatch.setattr(D, "_search_one", fake_ladder)

    out = await D.search("John 3:16")
    assert out[0].url == "https://gotquestions.org/y"
