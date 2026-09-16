"""Diagnostic: does this environment have network egress to the search
engines + social hosts fetch_social() depends on? Prints status + bytes so we
can tell 'network blocked' from 'engine soft-blocked' from 'code bug'.
"""
import asyncio
import httpx

from app.services.discussions import (
    DDG_HTML, DDG_LITE, BING_SEARCH, MOJEEK_SEARCH, REDDIT_SEARCH,
    _HEADERS, _REDDIT_HEADERS, _TIMEOUT,
)


URLS = [
    ("Mojeek GET", MOJEEK_SEARCH, "get", {"q": "John 3:16 site:reddit.com"}, _HEADERS),
    ("Bing GET", BING_SEARCH, "get", {"q": "John 3:16 site:reddit.com"}, _HEADERS),
    ("DDG POST", DDG_HTML, "post", {"q": "John 3:16 site:reddit.com", "kl": "us-en"}, _HEADERS),
    ("DDG LITE POST", DDG_LITE, "post", {"q": "John 3:16 site:reddit.com", "kl": "us-en"}, _HEADERS),
    ("Reddit JSON", "https://www.reddit.com/r/Christianity.json", "get", {"raw_json": 1}, _REDDIT_HEADERS),
]


async def hit(name, url, method, params, headers):
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=headers,
                                     follow_redirects=True) as c:
            if method == "post":
                r = await c.post(url, data=params)
            else:
                r = await c.get(url, params=params)
        body = r.text
        print(f"  {name:18s} {r.status_code}  bytes={len(body):6d}  "
              f"ctype={r.headers.get('content-type','')[:30]}")
        # show a short signature of the body
        snippet = body[:120].replace("\n", " ")
        print(f"      {snippet!r}")
    except Exception as exc:
        print(f"  {name:18s} EXCEPTION {type(exc).__name__}: {exc}")


async def main():
    print("=== engine egress diagnostic ===")
    for args in URLS:
        await hit(*args)
    # also try a direct social page fetch (the enrich step)
    print("\n=== sample page fetch ===")
    await hit("reddit thread",
              "https://www.reddit.com/r/Christianity/comments/abcde.json",
              "get", {"raw_json": 1}, _REDDIT_HEADERS)


if __name__ == "__main__":
    asyncio.run(main())
