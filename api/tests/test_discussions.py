"""Discussions service: real, cited sources only - never fabricated URLs."""
from __future__ import annotations

import pytest

DDG_SAMPLE = """
<a class="result__a" href="/l/?kh=-1&amp;uddg=https%3A%2F%2Fwww.biblegateway.com%2Fpassage%2F%3Fsearch%3DJohn%2B3%253A16&amp;rut=... ">What does John 3:16 mean?</a>
<a class="result__snippet">A devotional take on God's love.</a>
<a class="result__a" href="/l/?kh=-1&amp;uddg=https%3A%2F%2Fwww.reddit.com%2Fr%2Fatheism%2Fcomments%2Fjohn316%2F&amp;rut=...">Why I reject John 3:16</a>
<a class="result__snippet">A sceptical reading of the verse.</a>
"""


class _Resp:
    def __init__(self, text): self.text = text
    def raise_for_status(self): pass


async def _fake_post(self, url, **kw):  # httpx.AsyncClient.post
    return _Resp(DDG_SAMPLE)


@pytest.mark.asyncio
async def test_fetch_returns_real_cited_sources(monkeypatch):
    import app.services.discussions as D
    import httpx

    async def _fake_post(self, url, **kw):
        return _Resp(DDG_SAMPLE)
    async def _fake_get(self, url, **kw):
        return _Resp(DDG_SAMPLE)

    monkeypatch.setattr(httpx.AsyncClient, "post", _fake_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get)

    srcs = await D.search("John 3:16 Bible commentary discussion")
    urls = {s.url for s in srcs}
    assert "https://www.biblegateway.com/passage/?search=John+3%3A16" in urls
    assert "https://www.reddit.com/r/atheism/comments/john316/" in urls
    # every source has a real http(s) url and a title
    for s in srcs:
        assert s.url.startswith("http")
        assert s.title
        assert s.source  # host label


@pytest.mark.asyncio
async def test_build_discussions_cites_real_sources_only(monkeypatch):
    """The guide is built from fetched snippets; we never invent URLs."""
    import app.services.discussions as D
    import httpx
    from app.services.llm import LLMResult

    monkeypatch.setattr(httpx.AsyncClient, "post", _fake_post)

    real_url = "https://www.biblegateway.com/passage/?search=John+3%3A16"

    async def fake_complete(prompt, **kw):
        # The guide the model returns only cites the URLs we supplied.
        return LLMResult(
            text=f"One reading says God's love is central ({real_url}).",
            provider="x", model="m", data={})

    monkeypatch.setattr(D, "complete", fake_complete)

    out = await D.build_discussions(["John 3:16"], "love", 15)
    assert out["status"] == "ok"
    assert any(s["url"] == real_url for s in out["sources"])
    # the persisted guide contains only the real URL (no fabricated one)
    assert real_url in out["guide"]
    assert "http://example.com/fake" not in out["guide"]


@pytest.mark.asyncio
async def test_build_discussions_empty_when_no_sources(monkeypatch):
    import app.services.discussions as D
    import httpx

    async def _no_post(self, url, **kw):
        return _Resp("")
    async def _no_get(self, url, **kw):
        return _Resp("")
    monkeypatch.setattr(httpx.AsyncClient, "post", _no_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", _no_get)

    out = await D.build_discussions(["John 3:16"], "love", 15)
    assert out["status"] == "empty"
    assert out["sources"] == []
