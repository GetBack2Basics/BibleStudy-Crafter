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

    real_url = "https://www.biblegateway.com/passage/?search=John+3%3A16"
    sample_src = D.Source(title="What does John 3:16 mean?", url=real_url,
                          snippet="A devotional take on God's love.", source="biblegateway.com")

    async def fake_official(*a, **k):
        return [sample_src]
    async def fake_social(*a, **k):
        return []
    async def fake_neg(*a, **k):
        return []
    monkeypatch.setattr(D, "fetch_official", fake_official)
    monkeypatch.setattr(D, "fetch_social", fake_social)
    monkeypatch.setattr(D, "_fetch_targeted_negative", fake_neg)

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
async def test_build_discussions_splits_official_and_social(monkeypatch):
    """Official and social tracks are separate, de-duplicated, and 50:50 timed."""
    import app.services.discussions as D

    official = [
        D.Source(title="Commentary A", url="https://gotquestions.org/a",
                 snippet="devotional", source="gotquestions.org", kind="official"),
        D.Source(title="Commentary B", url="https://desiringgod.org/b",
                 snippet="scholarly", source="desiringgod.org", kind="official"),
    ]
    social = [
        D.Source(title="Reddit thread", url="https://www.reddit.com/r/x/1",
                 snippet="discussion", source="reddit.com", kind="social",
                 platform="reddit", engagement=420),
        # a duplicate URL that also appears in official -> must not double-count
        D.Source(title="Dup", url="https://gotquestions.org/a",
                 snippet="dup", source="gotquestions.org", kind="social",
                 platform="reddit", engagement=1),
    ]

    async def fake_official(*a, **k):
        return official
    async def fake_social(*a, **k):
        return social
    async def fake_neg(*a, **k):
        return []
    monkeypatch.setattr(D, "fetch_official", fake_official)
    monkeypatch.setattr(D, "fetch_social", fake_social)
    monkeypatch.setattr(D, "_fetch_targeted_negative", fake_neg)
    async def fake_complete(*a, **k):
        return __import__("app.services.llm").services.llm.LLMResult(
            text="## Official commentary\nx\n## Social commentary\ny",
            provider="p", model="m", data={})
    monkeypatch.setattr(D, "complete", fake_complete)

    out = await D.build_discussions(["John 3:16"], "love", 20)
    assert out["status"] == "ok"
    # 50:50 time split
    assert out["official_min"] + out["social_min"] == out["target_minutes"]
    assert out["official_min"] >= 2 and out["social_min"] >= 2
    # no source URL appears in both tracks
    off_urls = {s["url"] for s in out["official_sources"]}
    soc_urls = {s["url"] for s in out["social_sources"]}
    assert off_urls & soc_urls == set()
    # the duplicate gotquestions URL stays only in official (first claim wins)
    assert "https://gotquestions.org/a" in off_urls
    assert "https://gotquestions.org/a" not in soc_urls
    # social sources carry platform + engagement
    assert any(s["platform"] == "reddit" for s in out["social_sources"])
    assert out["social_sources"][0]["engagement"] == 420


@pytest.mark.asyncio
async def test_build_discussions_empty_when_no_sources(monkeypatch):
    import app.services.discussions as D

    async def fake_official(*a, **k):
        return []
    async def fake_social(*a, **k):
        return []
    async def fake_neg(*a, **k):
        return []
    async def fake_fallback(*a, **k):
        return []
    monkeypatch.setattr(D, "fetch_official", fake_official)
    monkeypatch.setattr(D, "fetch_social", fake_social)
    monkeypatch.setattr(D, "_fetch_targeted_negative", fake_neg)
    monkeypatch.setattr(D, "_generate_fallback_social", fake_fallback)

    out = await D.build_discussions(["John 3:16"], "love", 15)
    assert out["status"] == "empty"
    assert out["sources"] == []


@pytest.mark.asyncio
async def test_youtube_and_social_never_in_official_sources(monkeypatch):
    """YouTube, Reddit, and social platforms must never appear in official commentary sources."""
    import app.services.discussions as D

    # 1. Verify host classification
    assert D._social_host_ok("https://www.youtube.com/watch?v=123") == "youtube"
    assert D._social_host_ok("https://youtu.be/123") == "youtube"
    assert D._social_host_ok("https://m.youtube.com/watch?v=123") == "youtube"
    assert D._social_host_ok("https://www.reddit.com/r/Christianity/comments/abc") == "reddit"
    assert D._social_host_ok("https://x.com/pastor/status/123") == "x"
    assert D._social_host_ok("https://biblehub.com/commentaries/john/3-16.htm") is None
    assert D._social_host_ok("https://www.biblestudytools.com/commentaries/") is None

    # 2. Verify _classify
    yt_src = D.Source(title="YouTube Sermon", url="https://youtube.com/watch?v=abc", snippet="Video sermon", source="youtube.com")
    classified = D._classify(yt_src)
    assert classified.kind == "social"
    assert classified.platform == "youtube"

    comm_src = D.Source(title="Bible Hub", url="https://biblehub.com/commentaries/1.htm", snippet="Commentary text", source="biblehub.com")
    classified_comm = D._classify(comm_src)
    assert classified_comm.kind == "official"
    assert classified_comm.platform is None

    # 3. Verify build_discussions strictly partitions official vs social
    async def fake_search(query, **kw):
        return [
            D.Source(title="YouTube Video", url="https://youtube.com/watch?v=leak", snippet="Video", source="youtube.com", kind="official"),
            D.Source(title="Reddit Discussion", url="https://reddit.com/r/study", snippet="Post", source="reddit.com", kind="official"),
            D.Source(title="Bible Hub Study", url="https://biblehub.com/john/3-16.htm", snippet="Expository text", source="biblehub.com", kind="official"),
            D.Source(title="Bible Study Tools", url="https://www.biblestudytools.com/john-3-16.html", snippet="Tools", source="biblestudytools.com", kind="official"),
        ]

    monkeypatch.setattr(D, "search", fake_search)
    async def fake_neg(*a, **k):
        return []
    monkeypatch.setattr(D, "_fetch_targeted_negative", fake_neg)

    async def fake_complete(*a, **k):
        return __import__("app.services.llm").services.llm.LLMResult(
            text="## Guide\nBalanced study guide.",
            provider="test", model="test", data={})
    monkeypatch.setattr(D, "complete", fake_complete)

    out = await D.build_discussions(["John 3:16"], "love", 15)
    assert out["status"] == "ok"

    official_urls = [s["url"] for s in out["official_sources"]]
    social_urls = [s["url"] for s in out["social_sources"]]

    # Official section must NOT contain YouTube or Reddit
    for url in official_urls:
        assert "youtube" not in url, f"Leaked YouTube URL in official: {url}"
        assert "reddit" not in url, f"Leaked Reddit URL in official: {url}"

    # Social section should contain the social/video platforms
    assert any("youtube.com" in u for u in social_urls)
    assert any("reddit.com" in u for u in social_urls)

