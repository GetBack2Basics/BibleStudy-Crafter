"""Download public-domain Bibles from helloao.org and load them into Postgres.

Resume-safe: chapter JSON is cached to $BIBLE_CACHE/<CODE>/<BOOK>/<N>.json and
skipped when already present, so an interrupted run continues where it stopped.
Idempotent: verses are upserted on (translation_id, book_number, chapter, verse).

Usage:
    python -m app.seeder.seed_bible                 # every translation in the allowlist
    python -m app.seeder.seed_bible --only KJV
    python -m app.seeder.seed_bible --only KJV,WEB --books JHN,ROM
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlmodel import Session, select

from app.config import get_settings
from app.db import get_engine
from app.models import Book, Translation, Verse
from app.seeder.parsing import CANON, load_allowlist, parse_chapter
from app.services import events

API = "https://bible.helloao.org/api"
THROTTLE = 0.2
ALLOWLIST = Path(__file__).parent / "translations.txt"


def _cache_dir() -> Path:
    return Path(get_settings().bible_cache)


def fetch_json(client: httpx.Client, url: str, dest: Path | None = None) -> dict:
    """GET json, using dest as a resume cache when supplied."""
    if dest and dest.exists():
        try:
            return json.loads(dest.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            dest.unlink(missing_ok=True)      # corrupt partial download
    resp = client.get(url, timeout=60.0)
    resp.raise_for_status()
    data = resp.json()
    if dest:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(data), encoding="utf-8")
    time.sleep(THROTTLE)
    return data


def ensure_books(session: Session) -> dict[str, int]:
    """Insert the 66-book canon once; return {USFM code: book number}."""
    existing = {b.code: b.number for b in session.exec(select(Book)).all()}
    if len(existing) < len(CANON):
        for number, code, name, testament in CANON:
            if code not in existing:
                session.add(Book(number=number, code=code, name=name, testament=testament))
        session.commit()
        existing = {b.code: b.number for b in session.exec(select(Book)).all()}
    return existing


def upsert_translation(session: Session, code: str, meta: dict) -> Translation:
    row = session.exec(select(Translation).where(Translation.code == code)).first()
    if row is None:
        row = Translation(code=code, source_id=meta["id"], name=meta.get("name", code))
        session.add(row)
    row.source_id = meta["id"]
    row.name = meta.get("name", code)
    row.language = meta.get("language", "eng")
    row.license_url = (meta.get("licenseUrl") or "")[:500]
    row.website = (meta.get("website") or "")[:500]
    session.commit()
    session.refresh(row)
    return row


def load_chapter(session: Session, translation_id: int, book_number: int,
                 chapter: int, payload: dict) -> int:
    rows = [
        {
            "translation_id": translation_id,
            "book_number": book_number,
            "chapter": chapter,
            "verse": v.verse,
            "text": v.text,
            "words_of_jesus": v.words_of_jesus,
        }
        for v in parse_chapter(payload)
    ]
    if not rows:
        return 0
    stmt = pg_insert(Verse.__table__).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_verse_location",
        set_={"text": stmt.excluded.text, "words_of_jesus": stmt.excluded.words_of_jesus},
    )
    session.exec(stmt)
    return len(rows)


def seed_translation(client: httpx.Client, session: Session, code: str, source_id: str,
                     available: dict[str, dict], book_filter: set[str] | None) -> int:
    meta = available.get(source_id)
    if meta is None:
        events.emit("error", "seeder", f"{code}: source id '{source_id}' not in helloao index")
        return 0

    translation = upsert_translation(session, code, meta)
    ensure_books(session)
    cache = _cache_dir() / code

    books = fetch_json(client, f"{API}/{source_id}/books.json",
                       cache / "books.json").get("books", [])
    wanted = {c for _, c, _, _ in CANON}
    total = 0

    for book in books:
        bid = book.get("id")
        if bid not in wanted or (book_filter and bid not in book_filter):
            continue
        book_number = next(n for n, c, _, _ in CANON if c == bid)
        n_chapters = book.get("numberOfChapters", 0)
        for ch in range(1, n_chapters + 1):
            payload = fetch_json(client, f"{API}/{source_id}/{bid}/{ch}.json",
                                 cache / bid / f"{ch}.json")
            total += load_chapter(session, translation.id, book_number, ch, payload)
        session.commit()
        print(f"  {code} {bid:<4} {n_chapters:>3} ch  (running total {total:,} verses)", flush=True)

    translation.verse_count = total
    session.commit()

    # Sanity-check against the count helloao advertises. A large shortfall means
    # the run was interrupted, so flag it loudly rather than leaving a silently
    # incomplete Bible in the database.
    expected = meta.get("totalNumberOfVerses") or 0
    if not book_filter and expected and total < expected * 0.99:
        msg = f"{code}: loaded {total:,} of ~{expected:,} verses - INCOMPLETE"
        events.emit("warn", "seeder", msg)
        print(f"  !! {msg}", file=sys.stderr, flush=True)
        raise RuntimeError(msg)

    events.emit("success", "seeder", f"{code}: {total:,} verses loaded")
    return total


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Seed Bible translations into Postgres")
    ap.add_argument("--only", help="comma-separated local codes, e.g. KJV,WEB")
    ap.add_argument("--books", help="comma-separated USFM ids, e.g. JHN,ROM (default: all 66)")
    args = ap.parse_args(argv)

    allow = load_allowlist(ALLOWLIST)
    if args.only:
        keep = {c.strip().upper() for c in args.only.split(",")}
        allow = {k: v for k, v in allow.items() if k.upper() in keep}
        if not allow:
            print(f"No allowlist entries match --only {args.only}", file=sys.stderr)
            return 2
    book_filter = {b.strip().upper() for b in args.books.split(",")} if args.books else None

    events.emit("info", "seeder", f"Seeding {', '.join(allow)}")
    grand = 0
    failures: list[tuple[str, str]] = []

    with httpx.Client(headers={"User-Agent": "BibleStudy-Crafter/0.1"}) as client:
        index = fetch_json(client, f"{API}/available_translations.json",
                           _cache_dir() / "available_translations.json")
        available = {t["id"]: t for t in index.get("translations", index if isinstance(index, list) else [])}
        with Session(get_engine()) as session:
            for code, source_id in allow.items():
                print(f"[{code}] <- {source_id}", flush=True)
                try:
                    grand += seed_translation(client, session, code, source_id,
                                              available, book_filter)
                except Exception as exc:                      # noqa: BLE001
                    # A DB restart or network blip must not look like success.
                    # Re-running resumes from the on-disk chapter cache.
                    session.rollback()
                    failures.append((code, f"{type(exc).__name__}: {exc}"[:200]))
                    print(f"  !! {code} FAILED: {type(exc).__name__}: {exc}"[:300],
                          file=sys.stderr, flush=True)
                    events.emit("error", "seeder", f"{code} failed: {type(exc).__name__}")

    print(f"\nDone. {grand:,} verses loaded this run.")
    if failures:
        print(f"\n{len(failures)} translation(s) FAILED:", file=sys.stderr)
        for code, msg in failures:
            print(f"  {code}: {msg}", file=sys.stderr)
        print("Re-run the same command to resume (cached chapters are skipped).",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
