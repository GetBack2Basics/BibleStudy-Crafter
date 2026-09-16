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
import base64
import html
import ipaddress
import json
import re
import socket
import time
import urllib.parse
from dataclasses import dataclass, asdict
from typing import Any

import httpx

from app.services import events
from app.services.llm import NoProviderAvailable, complete

DDG_HTML = "https://html.duckduckgo.com/html/"
DDG_LITE = "https://lite.duckduckgo.com/lite/"
BING_SEARCH = "https://www.bing.com/search"
MOJEEK_SEARCH = "https://www.mojeek.com/search"
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

# Engine politeness. Mojeek (the only engine that reliably honours `site:` and
# does not rewrite the query) answers 403 to concurrent bursts: 12 parallel
# queries all fail, the same 12 serialized ~2s apart all succeed. So every
# outbound search request takes a global lock and waits its turn.
_SEARCH_GAP = 2.0
_search_lock = asyncio.Lock()
_last_search_at = 0.0


async def _throttle() -> None:
    """Serialize outbound search requests, >=_SEARCH_GAP apart."""
    global _last_search_at
    async with _search_lock:
        wait = _SEARCH_GAP - (time.monotonic() - _last_search_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_search_at = time.monotonic()


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


def _unwrap_bing(url: str) -> str:
    """Bing wraps every result in a /ck/a? redirect whose real target is
    base64url in the `u=a1...` parameter. Without decoding it, the host is
    always bing.com, so social results can never be recognised.
    """
    url = html.unescape(url or "")
    m = re.search(r"[?&]u=a1([A-Za-z0-9_\-]+)", url)
    if not m:
        return url
    raw = m.group(1)
    raw += "=" * (-len(raw) % 4)
    try:
        decoded = base64.urlsafe_b64decode(raw).decode("utf-8", "replace")
    except Exception:                # noqa: BLE001 - keep the wrapper on failure
        return url
    return decoded if decoded.startswith("http") else url


def _parse_bing(html_text: str) -> list[Source]:
    """Pull result cards out of Bing's /search HTML (li.b_algo blocks)."""
    out: list[Source] = []
    blocks = re.findall(r'<li class="b_algo".*?</li>', html_text, re.DOTALL)
    for block in blocks[:_PER_QUERY]:
        # The h2 anchor carries no fixed class and may have attributes before
        # href, so match loosely rather than requiring `<h2>\s*<a href=`.
        m = re.search(r'<h2[^>]*>\s*<a[^>]*?href="([^"]+)"', block, re.DOTALL)
        if not m:
            continue
        url = _unwrap_bing(m.group(1))
        if not url.startswith("http"):
            continue
        t = re.search(r'<h2[^>]*>\s*<a[^>]*>(.*?)</a>', block, re.DOTALL)
        title = _clean(t.group(1)) if t else ""
        # Snippet <p> usually carries a class in current markup.
        s = re.search(r'<p class="[^"]*"[^>]*>(.*?)</p>', block, re.DOTALL) \
            or re.search(r'<p[^>]*>(.*?)</p>', block, re.DOTALL)
        snippet = _clean(s.group(1)) if s else ""
        if not title:
            continue
        out.append(_classify(Source(title=title, url=url, snippet=snippet,
                                    source=_host_label(url))))
    return out


def _parse_mojeek(html_text: str) -> list[Source]:
    """Mojeek returns plain, unwrapped result URLs and honours `site:` scoping,
    which makes it the reliable path for per-platform social searches when the
    big engines soft-block or rewrite the query.
    """
    out: list[Source] = []
    blocks = re.findall(r'<li class="r\d+">.*?</li>', html_text, re.DOTALL)
    for block in blocks[:_PER_QUERY]:
        m = re.search(r'<h2><a class="title"[^>]*?href="([^"]+)"[^>]*>(.*?)</a>',
                      block, re.DOTALL)
        if not m:
            continue
        url = html.unescape(m.group(1))
        title = _clean(m.group(2))
        if not title or not url.startswith("http"):
            continue
        s = re.search(r'<p class="s">(.*?)</p>', block, re.DOTALL)
        snippet = _clean(s.group(1)) if s else ""
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


# ------------------------------------------------------------------ Brave API
# The engine ladder below (Mojeek/Bing/DDG) is IP-blocked from the runtime
# (Mojeek 403, DDG JS-challenge 202, Bing returns 200 but yields no usable
# `site:`-scoped social links). When a Brave Search API key is configured we
# route through Brave instead - a keyed, authenticated request that returns
# clean JSON and honours `site:` scoping (incl. site:reddit.com). This is the
# same class of "hosted search" that works where direct scraping does not.
BRAVE_SEARCH = "https://api.search.brave.com/res/v1/web/search"
_BRAVE_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}


def _brave_key() -> str:
    from app.config import get_settings
    return get_settings().brave_search_api_key


def _parse_brave(json_blob: dict) -> list[Source]:
    """Brave's web/search result set -> sources. Honours `site:` scoping that
    the caller already put in the query, so social-host classification still
    works."""
    out: list[Source] = []
    results = (json_blob.get("web", {}) or {}).get("results", []) or []
    for r in results[:_PER_QUERY]:
        url = r.get("url")
        if not url or not url.startswith("http"):
            continue
        title = _clean(r.get("title", ""))
        snippet = _clean(r.get("description", "")) or _clean(
            r.get("page_age", ""))
        if not title:
            continue
        out.append(_classify(Source(
            title=title, url=url, snippet=snippet,
            source=_host_label(url))))
    return out


async def _brave_search(query: str) -> list[Source]:
    """One Brave Search API call. Fails soft -> []. Returns real, cited
    results (Brave serves the true destination URL, not a wrapped one)."""
    key = _brave_key()
    if not key:
        return []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT,
                                     headers={**_BRAVE_HEADERS,
                                              "X-Subscription-Token": key},
                                     follow_redirects=True) as client:
            resp = await client.get(BRAVE_SEARCH, params={
                "q": query, "count": _PER_QUERY, "freshness": "all"})
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:        # noqa: BLE001 - never crash a generation job
        events.emit("warn", "discussions",
                    f"brave search failed for {query!r}: {exc}")
        return []
    return _parse_brave(data)


async def _search_one(url: str, query: str, parser) -> list[Source]:
    await _throttle()               # engines 403 on concurrent bursts
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS,
                                     follow_redirects=True) as client:
            if url in (DDG_HTML, DDG_LITE):
                resp = await client.post(url, data={"q": query, "kl": "us-en"})
            else:
                resp = await client.get(url, params={"q": query})
            resp.raise_for_status()
            return parser(resp.text)[:_PER_QUERY]
    except Exception as exc:        # noqa: BLE001 - never crash a generation job
        events.emit("warn", "discussions", f"search failed for {query!r}: {exc}")
        return []


# Engine ladder. Mojeek is tried alongside Bing because it does not rewrite the
# query and honours `site:` scoping, which is what makes social searches work;
# Bing contributes breadth for the official track.
_ENGINES = (
    (MOJEEK_SEARCH, _parse_mojeek),
    (BING_SEARCH, _parse_bing),
    (DDG_HTML, _parse_ddg),
    (DDG_LITE, _parse_ddg),
)


async def search(query: str, *, per_query: int = _PER_QUERY,
                 want_hosts: tuple[str, ...] = ()) -> list[Source]:
    """One live web search; returns real sources or [].

    If a hosted search API (Brave) is configured it is tried first - it is the
    reliable path from IP-blocked runtimes and returns real destination URLs.
    Otherwise (no key) we fall through to the engine ladder (Mojeek/Bing/DDG),
    which still works from unblocked networks.

    When `want_hosts` is given (social searches) a result set only counts as
    success if it actually contains one of those hosts - otherwise we fall
    through, because a soft-blocked engine happily returns ten irrelevant
    results rather than an error.
    """
    # 1) Hosted search API (Brave) when configured.
    if _brave_key():
        try:
            results = await _brave_search(query)
        except Exception:           # noqa: BLE001
            results = []
        if results:
            if not want_hosts or any(_social_host_ok(s.url) for s in results):
                return results[:per_query]
        # Brave returned nothing usable for this (e.g. social) query; fall
        # through to the engine ladder before giving up.

    # 2) Engine ladder fallback (Mojeek -> Bing -> DDG_HTML -> DDG_LITE).
    merged: list[Source] = []
    seen: set[str] = set()
    for url, parser in _ENGINES:
        try:
            results = await _search_one(url, query, parser)
        except Exception:           # noqa: BLE001
            results = []
        for src in results:
            if src.url not in seen:
                seen.add(src.url)
                merged.append(src)
        if not want_hosts:
            if merged:
                return merged[:per_query]
            continue
        if any(_social_host_ok(s.url) for s in merged):
            return merged[:per_query]
    return merged[:per_query]


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


async def _fetch_reddit_thread(url: str) -> tuple[str, int]:
    """Read a real Reddit thread: body + top comments + engagement.

    www.reddit.com HTML is a JS shell (no visible text), and its `.json` view
    answers 403 from datacentre IPs. old.reddit.com's `.json` is the path that
    actually returns content. Falls back to old.reddit HTML, then to ''.
    """
    if not _is_safe_url(url):
        return "", 0
    path = urllib.parse.urlparse(url).path
    for candidate in (f"https://old.reddit.com{path.rstrip('/')}.json",
                      f"https://www.reddit.com{path.rstrip('/')}.json"):
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT,
                                         headers=_REDDIT_HEADERS,
                                         follow_redirects=True) as client:
                resp = await client.get(candidate, params={"raw_json": 1})
                if resp.status_code != 200:
                    continue
                data = resp.json()
        except Exception:            # noqa: BLE001 - try the next candidate
            continue
        try:
            post = data[0]["data"]["children"][0]["data"]
            comments = data[1]["data"]["children"]
        except Exception:            # noqa: BLE001
            continue
        parts: list[str] = []
        body = _clean(post.get("selftext") or "")
        if body:
            parts.append(body)
        for c in comments[:6]:
            if not isinstance(c, dict):
                continue
            cd = c.get("data") or {}
            txt = _clean(cd.get("body") or "")
            if txt:
                parts.append("Comment: " + txt)
        engagement = (int(post.get("score", 0) or 0)
                      + int(post.get("num_comments", 0) or 0))
        text = (" | ".join(parts))[:1400]
        if text:
            return text, engagement
    # Last resort: old.reddit HTML (server-rendered, unlike www).
    text = await _fetch_page_text(
        f"https://old.reddit.com{path}", max_chars=1600)
    return text, 0


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
        body, engagement = await _fetch_reddit_thread(url)
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
        # Hyphenated ranges act as a NOT operator in search engines.
        q.append(f'{_search_safe_ref(r)} Bible commentary meaning')
    if topic:
        q.append(f"{topic} Bible study commentary")
    return q[:4]


_SOCIAL_SITES = (
    ("reddit.com", "reddit"),
    ("quora.com", "quora"),
    ("x.com", "x"),
    ("facebook.com", "facebook"),
)


def _search_safe_ref(ref: str) -> str:
    """Make a verse reference safe for a search box.

    "Matthew 11:28-30" contains a hyphen, which every major engine reads as the
    NOT operator (`-30` = exclude documents containing "30"). That silently
    guts the result set. We keep the opening verse and drop the range.
    """
    ref = (ref or "").strip()
    if not ref:
        return ""
    return re.sub(r"\s*[-–]\s*\d+\s*$", "", ref)


def _social_queries(refs: list[str], topic: str) -> list[tuple[str, str]]:
    """`site:`-scoped queries, one per platform per seed.

    Returns (query, platform) pairs. Two lessons are baked in here:
      * hyphenated verse ranges must be stripped (see _search_safe_ref), and
      * `site:` scoping is what actually pins a query to a platform - the older
        "<seed> reddit" phrasing returned generic Bible pages with no social
        host in them at all.
    """
    seeds = [_search_safe_ref(r) for r in refs[:2]]
    if topic:
        seeds.append(topic.strip())
    seeds = [s for s in seeds if s]
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for seed in seeds:
        for host, plat in _SOCIAL_SITES:
            q = f"{seed} site:{host}"
            if q not in seen:
                seen.add(q)
                out.append((q, plat))
    return out[:12]


async def fetch_official(refs: list[str], topic: str) -> list[Source]:
    queries = _official_queries(refs, topic)
    try:
        results = await asyncio.wait_for(
            asyncio.gather(*(search(q) for q in queries)), timeout=90.0)
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
    """Mirror a manual social search: `site:`-scoped per-platform queries, then
    visit each result page for its real content.

    - Reddit: its JSON API is tried first (real engagement), but it answers 403
      to datacentre IPs, so the `site:reddit.com` web path is the reliable one
      and each thread is read via old.reddit.com (the www HTML is a JS shell).
    - Quora / X / Facebook: `site:`-scoped search, results filtered to the right
      host, then each page fetched for its visible text.
    Highest-engagement social examples surface first; no duplicate URLs.
    """
    queries = _social_queries(refs, topic)

    # 1) Reddit via JSON API (engagement-ranked). Best effort: commonly blocked.
    reddit_tasks = [_fetch_reddit(f"{_search_safe_ref(r)} Bible") for r in refs[:2]]
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

    # 2) All four platforms via `site:`-scoped web search; keep only real social
    #    hosts, then fetch each page for real content.
    try:
        web_groups = await asyncio.wait_for(
            asyncio.gather(*(search(q, want_hosts=(plat,))
                             for q, plat in queries)), timeout=180.0)
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
        if src.platform == "reddit":
            body, engagement = await _fetch_reddit_thread(src.url)
            if body:
                src.snippet = body
                if engagement:
                    src.engagement = engagement
            return src
        text = await _fetch_page_text(src.url, max_chars=1600)
        if not text:
            # Try once more with a wider window for short pages (e.g. single-verse
            # devotional pages that return little visible text the first pass).
            text = await _fetch_page_text(src.url, max_chars=6000)
        if text:
            src.snippet = text
        return src
    try:
        web_candidates = list(await asyncio.wait_for(
            asyncio.gather(*(_enrich(s) for s in web_candidates)), timeout=40.0))
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
