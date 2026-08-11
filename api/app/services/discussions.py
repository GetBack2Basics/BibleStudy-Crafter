"""Real, cited discussion material for a day's verses - split into two tracks.

The user wants the "notes" section grounded in what *people have actually
said* about the verses, including critical / anti-Christian takes, with real
links back to the source. We never let the LLM invent URLs: every item in the
result is a real page we fetched ourselves.

Two tracks (50:50 split of the day's discussion-reading time):
  * OFFICIAL  - blogs, commentaries, denominational / scholarly sites,
                gotquestions, desiringgod, etc. (the "official commentary").
  * SOCIAL    - what ordinary people said on Reddit, Quora, X and Facebook
                (the "social commentary"). For socials we prefer the examples
                with the most engagement.

Reddit is fetched from its public, keyless JSON API (which exposes real
upvote/comment counts) so we can honour "use examples with the most
engagement". Quora / X / Facebook are fetched via scoped web search (best
effort - the sandbox may or may not return parseable results).

Everything fails soft: a network hiccup yields fewer sources, never a
fabricated one.
"""
from __future__ import annotations

import asyncio
import html
import ipaddress
import json
import re
import socket
import urllib.parse
from dataclasses import dataclass, asdict
from typing import Any

import httpx

from app.services import events
from app.services.llm import NoProviderAvailable, complete

DDG_HTML = "https://html.duckduckgo.com/html/"
BING_SEARCH = "https://www.bing.com/search"
REDDIT_SEARCH = "https://www.reddit.com/search.json"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
# Reddit blocks the default UA sometimes; a benign bot UA is fine for the
# public JSON endpoint (it is unauthenticated, rate-limited, keyless).
_REDDIT_HEADERS = {
    "User-Agent": "BibleStudy-Crafter/1.0 (educational bible-study tool)",
    "Accept": "application/json",
}
_TIMEOUT = 12.0
_PER_QUERY = 6          # results kept per web-search query
_MAX_SOURCES = 18       # hard cap per track fed to / returned from the LLM


# ------------------------------------------------------------------- SSRF guard
# We fetch arbitrary URLs returned by search engines. Block non-http(s) schemes
# and any host that resolves to a private / loopback / link-local address so a
# malicious or poisoned result can't make the server fetch internal services
# (e.g. 169.254.169.254, localhost admin ports, 10.0.0.0/8, 192.168.0.0/16).
def _is_safe_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname
    if not host:
        return False
    # Resolve once; reject if ANY resolved address is private/loopback/link-local.
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False
    return True



@dataclass
class Source:
    title: str
    url: str
    snippet: str
    source: str                  # human label derived from the host
    kind: str = "official"       # "official" | "social"
    platform: str | None = None  # reddit | quora | x | facebook | None
    engagement: int | None = None  # upvotes+comments where known (socials)


# Hosts that count as "social" and the platform label for each.
_SOCIAL_HOSTS = {
    "reddit.com": "reddit",
    "www.reddit.com": "reddit",
    "old.reddit.com": "reddit",
    "quora.com": "quora",
    "www.quora.com": "quora",
    "x.com": "x",
    "www.x.com": "x",
    "twitter.com": "x",
    "www.twitter.com": "x",
    "facebook.com": "facebook",
    "www.facebook.com": "facebook",
    "m.facebook.com": "facebook",
    "fb.com": "facebook",
}


def _host_label(url: str) -> str:
    try:
        net = urllib.parse.urlparse(url).netloc.lower()
        return net[4:] if net.startswith("www.") else net
    except Exception:
        return url


def _platform_of(url: str) -> str | None:
    try:
        net = urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return None
    return _SOCIAL_HOSTS.get(net)


def _classify(src: Source) -> Source:
    plat = _platform_of(src.url)
    if plat:
        src.kind = "social"
        src.platform = plat
    return src


def _clean(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_bing(html_text: str) -> list[Source]:
    """Pull result cards out of Bing's /search HTML (li.b_algo blocks)."""
    out: list[Source] = []
    blocks = re.findall(r'<li class="b_algo".*?</li>', html_text, re.DOTALL)
    for block in blocks[:_PER_QUERY]:
        m = re.search(r'<h2>\s*<a[^>]*href="([^"]+)"', block)
        if not m:
            continue
        url = m.group(1)
        if not url.startswith("http"):
            continue
        t = re.search(r'<h2>\s*<a[^>]*>(.*?)</a>', block, re.DOTALL)
        title = _clean(t.group(1)) if t else ""
        s = re.search(r'<p[^>]*>(.*?)</p>', block, re.DOTALL)
        snippet = _clean(s.group(1)) if s else ""
        if not title:
            continue
        out.append(_classify(Source(title=title, url=url, snippet=snippet,
                                    source=_host_label(url))))
    return out


def _parse_ddg(html_text: str) -> list[Source]:
    """Pull result cards out of DuckDuckGo's HTML endpoint (secondary)."""
    out: list[Source] = []
    titles = re.findall(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                        html_text, re.DOTALL)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>',
                          html_text, re.DOTALL)
    for i, (href, raw_title) in enumerate(titles[:_PER_QUERY]):
        real = href
        m = re.search(r"uddg=([^&]+)", href)
        if m:
            real = urllib.parse.unquote(m.group(1))
        snippet = _clean(snippets[i]) if i < len(snippets) else ""
        title = _clean(raw_title)
        if not title or not real.startswith("http"):
            continue
        out.append(_classify(Source(title=title, url=real, snippet=snippet,
                                    source=_host_label(real))))
    return out


async def _search_one(url: str, query: str, parser) -> list[Source]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS,
                                     follow_redirects=True) as client:
            if url == DDG_HTML:
                resp = await client.post(url, data={"q": query, "kl": "us-en"})
            else:
                resp = await client.get(url, params={"q": query})
            resp.raise_for_status()
            return parser(resp.text)[:_PER_QUERY]
    except Exception as exc:        # noqa: BLE001 - never crash a generation job
        events.emit("warn", "discussions", f"search failed for {query!r}: {exc}")
        return []


async def search(query: str, *, per_query: int = _PER_QUERY) -> list[Source]:
    """One live web search across providers; returns real sources or [].

    Bing is primary (reachable from the deployment network); DuckDuckGo HTML is
    a fallback. Each provider is tried until one yields results.
    """
    for url, parser in ((BING_SEARCH, _parse_bing), (DDG_HTML, _parse_ddg)):
        try:
            results = await _search_one(url, query, parser)
        except Exception:
            results = []
        if results:
            return results[:per_query]
    return []


def _strip_tags_to_text(html_text: str) -> str:
    """Best-effort visible-text extraction (no external deps)."""
    text = re.sub(r"(?is)<script.*?</script>", " ", html_text)
    text = re.sub(r"(?is)<style.*?</style>", " ", text)
    text = re.sub(r"(?is)<head.*?</head>", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


async def _fetch_page_text(url: str, *, max_chars: int = 1200) -> str:
    """Visit a result page and return its visible text (real content, not just
    the search snippet). Fails soft -> ''.
    """
    if not _is_safe_url(url):        # SSRF guard: no private/loopback hosts
        events.emit("warn", "discussions", f"refusing unsafe url: {url}")
        return ""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS,
                                     follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return _strip_tags_to_text(resp.text)[:max_chars]
    except Exception as exc:        # noqa: BLE001
        events.emit("warn", "discussions", f"page fetch failed for {url}: {exc}")
        return ""


def _read_reddit_json(html_text: str) -> tuple[str, int]:
    """From a Reddit post HTML page, pull the JSON behind it for body + top
    comments + score. Returns (text, engagement)."""
    m = re.search(r'window\.___r\.context\s*=\s*(\{.*?\});\s*</script>',
                  html_text, re.DOTALL)
    if not m:
        return "", 0
    try:
        ctx = json.loads(m.group(1))
    except Exception:
        return "", 0
    pm = ctx.get("postModel") or {}
    body = _clean(pm.get("selftext", ""))
    score = int(pm.get("score", 0) or 0)
    comments = ctx.get("comments", []) or ctx.get("commentTree", []) or []
    parts = [body] if body else []
    for c in comments[:6]:
        txt = _clean(c.get("body", "")) if isinstance(c, dict) else ""
        if txt:
            parts.append("Comment: " + txt)
    engagement = score + len(comments)
    return (" | ".join(parts))[:1400], engagement


async def _fetch_reddit(query: str, limit: int = 6) -> list[Source]:
    """Reddit's public, keyless JSON search - returns real threads with
    engagement. Each thread is then *visited* to read its real body + top
    comments (not just the one-line search snippet).
    """
    params = {"q": query, "sort": "top", "limit": limit, "raw_json": 1,
              "t": "all"}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_REDDIT_HEADERS,
                                     follow_redirects=True) as client:
            resp = await client.get(REDDIT_SEARCH, params=params)
            resp.raise_for_status()
            data = resp.json().get("data", {}).get("children", [])
    except Exception as exc:        # noqa: BLE001
        events.emit("warn", "discussions", f"reddit search failed: {exc}")
        return []
    # Top N by engagement first.
    items = sorted(
        (c.get("data", {}) for c in data),
        key=lambda d: int(d.get("score", 0) or 0) + int(d.get("num_comments", 0) or 0),
        reverse=True,
    )[:limit]
    out: list[Source] = []
    for d in items:
        permalink = d.get("permalink")
        if not permalink:
            continue
        url = "https://www.reddit.com" + permalink
        if not _is_safe_url(url):    # defense-in-depth against poisoned permalinks
            continue
        title = _clean(d.get("title", "")) or "(reddit thread)"
        ncomments = int(d.get("num_comments", 0) or 0)
        # Visit the thread for the real body + top comments.
        page = await _fetch_page_text(url, max_chars=1600)
        body, engagement = _read_reddit_json(page) if page else ("", 0)
        if not body:
            body = _clean(d.get("selftext", ""))[:400] or f"Reddit discussion with {ncomments} comments."
        out.append(Source(
            title=title, url=url, snippet=body,
            source="reddit.com", kind="social", platform="reddit",
            engagement=engagement or (int(d.get("score", 0) or 0) + ncomments),
        ))
    return out


# Platforms we reach via plain web search (Reddit is ALSO fetched via its
# JSON API for real engagement; including reddit.com here means we still pick
# up Reddit threads from the web results if the JSON API is blocked).
_WEB_SOCIAL = [
    ("reddit.com", "reddit"),
    ("quora.com", "quora"),
    ("x.com", "x"),
    ("twitter.com", "x"),
    ("facebook.com", "facebook"),
]


def _official_queries(refs: list[str], topic: str) -> list[str]:
    q: list[str] = []
    for r in refs[:3]:
        q.append(f'{r} Bible commentary - what does this verse mean')
    if topic:
        q.append(f"{topic} Bible study commentary")
    return q[:4]


def _social_queries(refs: list[str], topic: str) -> list[str]:
    """Plain, human-style search queries - one per social platform.

    These mirror what a person types into Google, e.g.
    "Yoked with Christ reddit" / "Yoked with Christ facebook" - which DO
    return real threads. We deliberately avoid `site:` scoping (engines often
    drop those) and instead filter results to the right host afterwards.
    """
    q: list[str] = []
    seeds = list(refs[:2])
    if topic:
        seeds.append(topic)
    for seed in seeds:
        for _, plat in _WEB_SOCIAL:
            q.append(f"{seed} {plat}")
    # De-duplicate queries (e.g. x.com + twitter.com both yield "... x").
    seen_q: set[str] = set()
    uniq: list[str] = []
    for item in q:
        if item not in seen_q:
            seen_q.add(item)
            uniq.append(item)
    return uniq[:10]


async def fetch_official(refs: list[str], topic: str) -> list[Source]:
    queries = _official_queries(refs, topic)
    try:
        results = await asyncio.wait_for(
            asyncio.gather(*(search(q) for q in queries)), timeout=20.0)
    except asyncio.TimeoutError:
        results = []
    seen: set[str] = set()
    merged: list[Source] = []
    for src in (s for group in results for s in group):
        if src.url in seen or src.kind == "social":
            continue
        seen.add(src.url)
        merged.append(src)
        if len(merged) >= _MAX_SOURCES:
            break
    return merged


def _social_host_ok(url: str) -> str | None:
    """Return the social platform for a URL if it's a real social host, else None."""
    try:
        net = urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return None
    if net.startswith("www."):
        net = net[4:]
    for host, plat in (("reddit.com", "reddit"), ("quora.com", "quora"),
                       ("x.com", "x"), ("twitter.com", "x"),
                       ("facebook.com", "facebook")):
        if net == host or net.endswith("." + host):
            return plat
    return None


async def _rank_social(results: list[Source]) -> list[Source]:
    """Sort social results by engagement (Reddit exposes it) then keep order."""
    return sorted(results, key=lambda s: s.engagement or 0, reverse=True)


async def fetch_social(refs: list[str], topic: str) -> list[Source]:
    """Mirror a manual social search: plain per-platform queries, then visit
    each result page for its real content.

    - Reddit: fetched via its JSON API (real engagement) and each thread's
      page is read for body + top comments.
    - Quora / X / Facebook: plain web search, results filtered to the right
      host, then each page is fetched for its visible text.
    Highest-engagement social examples surface first; no duplicate URLs.
    """
    queries = _social_queries(refs, topic)

    # 1) Reddit via JSON API (engagement-ranked, with real page content).
    reddit_tasks = [_fetch_reddit(f"{r} Bible") for r in refs[:2]]
    if topic:
        reddit_tasks.append(_fetch_reddit(topic))
    try:
        reddit_groups = await asyncio.wait_for(
            asyncio.gather(*reddit_tasks), timeout=25.0)
    except asyncio.TimeoutError:
        reddit_groups = []
    reddit_seen: set[str] = set()
    reddit: list[Source] = []
    for src in (s for group in reddit_groups for s in group):
        if src.url in reddit_seen:
            continue
        reddit_seen.add(src.url)
        reddit.append(src)

    # 2) Quora / X / Facebook via plain web search; keep only social hosts,
    #    then fetch each page for real content.
    try:
        web_groups = await asyncio.wait_for(
            asyncio.gather(*(search(q) for q in queries)), timeout=25.0)
    except asyncio.TimeoutError:
        web_groups = []
    web_candidates: list[Source] = []
    web_seen: set[str] = set()
    for src in (s for group in web_groups for s in group):
        plat = _social_host_ok(src.url)
        if not plat or src.url in web_seen or src.url in reddit_seen:
            continue
        web_seen.add(src.url)
        src.kind = "social"
        src.platform = plat
        web_candidates.append(src)

    # Fetch real page content for the web candidates (bounded concurrency).
    async def _enrich(src: Source) -> Source:
        text = await _fetch_page_text(src.url, max_chars=1600)
        if text and src.platform == "reddit":
            body, engagement = _read_reddit_json(text)
            if body:
                src.snippet = body
                if engagement:
                    src.engagement = engagement
        elif text:
            src.snippet = text
        return src
    try:
        web_candidates = list(await asyncio.wait_for(
            asyncio.gather(*(_enrich(s) for s in web_candidates)), timeout=25.0))
    except asyncio.TimeoutError:
        pass

    merged = reddit + web_candidates
    merged = await _rank_social(merged)
    return merged[:_MAX_SOURCES]


def _dedupe_all(official: list[Source], social: list[Source]) -> tuple[list[Source], list[Source]]:
    """Guarantee no source URL appears in both tracks.

    Official is fetched first, so any URL that also shows up in the social
    track is dropped from social (the duplicate is an official-style site that
    leaked in via a scoped search).
    """
    off_urls = {s.url for s in official}
    soc_clean = [s for s in social if s.url not in off_urls]
    return official, soc_clean


_DISCUSSION_PROMPT = """You are curating a reading guide for a Bible study reader.
Below are REAL search results about the day's verses - each has a title, a URL,
and a snippet of what was actually written. Your job is to help the reader have
a thoughtful, honest conversation with God, grounded in what people have really
said about these verses.

RULES (do not break them):
- Quote or faithfully paraphrase ONLY what the snippets say. Do NOT invent
  commentary, statistics or claims not present in the snippets.
- Include a MIX of perspectives: devotional, scholarly, and sceptical /
  critical / anti-Christian readings are all welcome - the reader wants to
  engage real disagreement, not an echo chamber.
- Every claim you make MUST end with the source URL in parentheses, e.g.
  (https://example.com/page). Only use the URLs provided below.
- Split the reading into TWO clearly headed sections:
  ## Official commentary
  (drawn from the OFFICIAL sources - blogs, commentaries, denominational sites)
  ## Social commentary
  (drawn from the SOCIAL sources - Reddit, Quora, X, Facebook discussions)
  Aim for a roughly 50:50 split of the reading time between the two sections
  (~{target_minutes} minutes total -> about {official_min} min official,
  {social_min} min social).

DAY TOPIC: {topic}
VERSES: {refs}

OFFICIAL SOURCES (title | url | snippet):
{official}

SOCIAL SOURCES (title | url | snippet | engagement):
{social}
"""


async def build_discussions(refs: list[str], topic: str, minutes: int,
                            *, session=None, study_id: int | None = None
                            ) -> dict[str, Any]:
    """Return {official_sources[], social_sources[], sources[], guide, ...}."""
    refs = [r for r in (refs or []) if r]
    target_minutes = max(3, round(minutes / 2))
    official_min = max(2, round(target_minutes / 2))
    social_min = max(2, target_minutes - official_min)

    official, social = await asyncio.gather(
        fetch_official(refs, topic), fetch_social(refs, topic))
    official, social = _dedupe_all(official, social)

    official_dicts = [asdict(s) for s in official]
    social_dicts = [asdict(s) for s in social]
    combined = official_dicts + social_dicts

    if not combined:
        return {
            "refs": refs,
            "topic": topic,
            "minutes": minutes,
            "target_minutes": target_minutes,
            "official_min": official_min,
            "social_min": social_min,
            "official_sources": [],
            "social_sources": [],
            "sources": [],
            "guide": "No external discussion could be fetched for these verses "
                     "right now. Engage the Scripture directly and journal your "
                     "own response.",
            "status": "empty",
        }

    off_block = "\n".join(
        f"{i+1}. {s.title} | {s.url} | {s.snippet}"
        for i, s in enumerate(official)) or "(none)"
    soc_block = "\n".join(
        f"{i+1}. {s.title} | {s.url} | {s.snippet} | engagement={s.engagement}"
        for i, s in enumerate(social)) or "(none)"

    prompt = _DISCUSSION_PROMPT.format(
        target_minutes=target_minutes, official_min=official_min,
        social_min=social_min,
        topic=topic or "(the day's verses)", refs=", ".join(refs),
        official=off_block, social=soc_block,
    )
    try:
        res = await complete(
            prompt,
            system=("You compile cited reading guides from real web snippets. "
                    "You never fabricate URLs; you only cite the URLs given. "
                    "You quote/paraphrase the snippets faithfully and split the "
                    "guide into Official and Social commentary sections."),
            study_id=study_id, session=session,
        )
        guide = res.text.strip()
    except NoProviderAvailable:
        guide = (
            "## Official commentary\n"
            + "\n\n".join(f"**{s.title}** ({s.source})\n{s.snippet}\n{s.url}"
                         for s in official)
            + "\n\n## Social commentary\n"
            + "\n\n".join(f"**{s.title}** ({s.platform})\n{s.snippet}\n{s.url}"
                         for s in social)
        )

    return {
        "refs": refs,
        "topic": topic,
        "minutes": minutes,
        "target_minutes": target_minutes,
        "official_min": official_min,
        "social_min": social_min,
        "official_sources": official_dicts,
        "social_sources": social_dicts,
        "sources": combined,
        "guide": guide,
        "status": "ok",
    }
