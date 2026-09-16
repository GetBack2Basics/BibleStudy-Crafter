"""Standalone probe: re-run fetch_social() (with the throttle) and report
how many real social sources come back, broken down by platform.

Run with the project venv:  .venv/Scripts/python probe_social.py
"""
import asyncio
import time

from app.services import discussions as D


async def main():
    refs = ["John 3:16", "Romans 8:28"]
    topic = "God's love and providence"
    t0 = time.monotonic()
    sources = await D.fetch_social(refs, topic)
    elapsed = time.monotonic() - t0

    per_platform: dict = {}
    for s in sources:
        per_platform[s.platform or "unknown"] = per_platform.get(
            s.platform or "unknown", 0) + 1

    print(f"\n=== fetch_social probe ===")
    print(f"refs={refs!r} topic={topic!r}")
    print(f"elapsed: {elapsed:.1f}s  total sources: {len(sources)}")
    print("per platform:")
    for plat, n in sorted(per_platform.items(), key=lambda kv: -kv[1]):
        print(f"  {plat}: {n}")
    print("\nsample (first 6):")
    for s in sources[:6]:
        print(f"  [{s.platform}] {s.source} - {s.title[:60]}")
        print(f"      {s.url}")
    # Contract check: multiple distinct social hosts expected.
    hosts = {D._host_label(s.url) for s in sources}
    print(f"\ndistinct social hosts: {sorted(hosts)}")
    ok = len(sources) >= 2 and len(hosts) >= 2
    print("MULTIPLE SOCIAL SOURCES:" , "YES" if ok else "NO (only burst/block)")
    return ok


if __name__ == "__main__":
    asyncio.run(main())
