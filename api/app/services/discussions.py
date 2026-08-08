"""Real, cited discussion material for a day's verses.

The user wants the "notes" section to be grounded in what *people have
actually said* about the verses - including critical / anti-Christian takes -
with real links back to the source. We never let the LLM invent URLs: every
item in the result is a real page we fetched ourselves.

Pipeline:
  1. For each verse ref (+ the day topic) run a live web search and keep the
     real titles / URLs / snippets.
  2. Hand those fetched snippets to the LLM and ask it to write a short,
     quotation-rich reading guide that quotes/paraphrases ONLY what the fetched
     sources say, citing each source by its real URL. If the LLM is unavailable
     we fall back to returning the raw fetched sources (still real + cited).

Everything here fails soft: a network hiccup yields fewer sources, never a
fabricated one.
"""
from __future__ import annotations

import asyncio
import html
import re
import urllib.parse
from dataclasses import dataclass, asdict
from typing import Any

import httpx

from app.services import events
from app.services.llm import NoProviderAvailable, complete

DDG_HTML = "https://html.duckduckgo.com/html/"
BING_SEARCH = "https://www.bing.com/search"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
_TIMEOUT = 12.0
_PER_QUERY = 6          # results kept per search query
_MAX_SOURCES = 18       # hard cap on sources fed to / returned from the LLM


@dataclass
class Source:
    title: str
    url: str
    snippet: str
    source: str          # human label derived from the host


def _host_label(url: str) -> str:
    try:
        net = urllib.parse.urlparse(url).netloc.lower()
        return net[4:] if net.startswith("www.") else net
    except Exception:
        return url


def _clean(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_bing(html_text: str) -> list[Source]:
    """Pull result cards out of Bing's /search HTML (li.b_algo blocks)."""
    out: list[Source] = []
    # Each organic result: <li class="b_algo"> ... <h2><a href="URL">TITLE</a> ...
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
        # snippet: Bing uses <p> inside the algo block (caption)
        s = re.search(r'<p[^>]*>(.*?)</p>', block, re.DOTALL)
        snippet = _clean(s.group(1)) if s else ""
        if not title:
            continue
        out.append(Source(title=title, url=url, snippet=snippet,
                          source=_host_label(url)))
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
        out.append(Source(title=title, url=real, snippet=snippet,
                          source=_host_label(real)))
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
    """One live search across providers; returns real sources or [].

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


def _queries_for(refs: list[str], topic: str) -> list[str]:
    """Limit to a handful of searches so the fetch stays within its time budget."""
    q: list[str] = []
    for r in refs[:3]:                       # cap verses searched to keep it fast
        q.append(f'{r} Bible commentary - what does this verse mean')
    if topic:
        q.append(f"{topic} Bible study discussion")
    return q[:4]


async def fetch_sources(refs: list[str], topic: str) -> list[Source]:
    """Run every query concurrently and de-duplicate by URL.

    Bounded overall so the on-demand endpoint returns in reasonable time even
    when some searches are slow.
    """
    queries = _queries_for(refs, topic)
    try:
        results = await asyncio.wait_for(
            asyncio.gather(*(search(q) for q in queries)), timeout=25.0)
    except asyncio.TimeoutError:
        results = []
    seen: set[str] = set()
    merged: list[Source] = []
    for src in (s for group in results for s in group):
        if src.url in seen:
            continue
        seen.add(src.url)
        merged.append(src)
        if len(merged) >= _MAX_SOURCES:
            break
    return merged


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
- Aim for enough varied reading to fill roughly HALF of the day's allotted
  time ({minutes} minutes total -> about {target_minutes} minutes of reading).
  That usually means 4-8 short annotated entries.

DAY TOPIC: {topic}
VERSES: {refs}

REAL SOURCES (title | url | snippet):
{sources}
"""


async def build_discussions(refs: list[str], topic: str, minutes: int,
                            *, session=None, study_id: int | None = None
                            ) -> dict[str, Any]:
    """Return {ref_lookup, sources[], guide} - all real and cited."""
    refs = [r for r in (refs or []) if r]
    sources = await fetch_sources(refs, topic)
    source_dicts = [asdict(s) for s in sources]

    target_minutes = max(3, round(minutes / 2))
    if not sources:
        return {
            "refs": refs,
            "topic": topic,
            "minutes": minutes,
            "target_minutes": target_minutes,
            "sources": [],
            "guide": "No external discussion could be fetched for these verses "
                     "right now. Engage the Scripture directly and journal your "
                     "own response.",
            "status": "empty",
        }

    src_block = "\n".join(
        f"{i+1}. {s.title} | {s.url} | {s.snippet}"
        for i, s in enumerate(sources)
    )
    prompt = _DISCUSSION_PROMPT.format(
        minutes=minutes, target_minutes=target_minutes,
        topic=topic or "(the day's verses)", refs=", ".join(refs),
        sources=src_block,
    )
    try:
        res = await complete(
            prompt,
            system=("You compile cited reading guides from real web snippets. "
                    "You never fabricate URLs; you only cite the URLs given. "
                    "You quote/paraphrase the snippets faithfully."),
            study_id=study_id, session=session,
        )
        guide = res.text.strip()
    except NoProviderAvailable:
        # Soft fallback: present the real sources with their snippets.
        guide = "\n\n".join(
            f"**{s.title}** ({s.source})\n{s.snippet}\n{s.url}"
            for s in sources
        )

    return {
        "refs": refs,
        "topic": topic,
        "minutes": minutes,
        "target_minutes": target_minutes,
        "sources": source_dicts,
        "guide": guide,
        "status": "ok",
    }
