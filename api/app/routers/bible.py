"""/api/bible endpoints: translations, passage, compare, search."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text as sql_text
from sqlmodel import Session, select

from app.db import get_session
from app.models import Translation
from app.services import bible_service as bs

router = APIRouter(prefix="/api/bible", tags=["bible"])


@router.get("/translations")
def list_translations(session: Session = Depends(get_session)) -> dict:
    rows = session.exec(select(Translation).order_by(Translation.code)).all()
    return {
        "translations": [
            {
                "code": t.code,
                "name": t.name,
                "language": t.language,
                "license_url": t.license_url,
                "website": t.website,
                "verse_count": t.verse_count,
            }
            for t in rows
        ]
    }


@router.get("/passage")
def get_passage(
    ref: str = Query(..., description='e.g. "John 3:16-18"'),
    translation: str = Query("KJV"),
    session: Session = Depends(get_session),
) -> dict:
    try:
        parsed = bs.parse_ref(ref)
    except ValueError as exc:
        raise HTTPException(400, f"bad reference: {exc}") from exc
    try:
        verses = bs.get_passage(session, parsed, translation)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    if not verses:
        raise HTTPException(404, f"no verses found for {bs.format_ref(parsed)} in {translation}")
    return {
        "ref": bs.format_ref(parsed),
        "translation": translation.upper(),
        "book": bs.book_name(parsed.book),
        "chapter": parsed.chapter,
        "verses": verses,
    }


@router.get("/compare")
def compare(
    ref: str = Query(...),
    translations: str = Query("KJV,WEB", description="comma-separated codes"),
    session: Session = Depends(get_session),
) -> dict:
    try:
        parsed = bs.parse_ref(ref)
    except ValueError as exc:
        raise HTTPException(400, f"bad reference: {exc}") from exc

    codes = [c.strip().upper() for c in translations.split(",") if c.strip()]
    if not codes:
        raise HTTPException(400, "no translations requested")

    rows = bs.get_comparison(session, parsed, codes)
    if not rows:
        raise HTTPException(404, f"no verses found for {bs.format_ref(parsed)}")

    available = {
        t.code: t.name
        for t in session.exec(select(Translation).where(Translation.code.in_(codes))).all()
    }
    return {
        "ref": bs.format_ref(parsed),
        "translations": [{"code": c, "name": available.get(c, c), "loaded": c in available}
                         for c in codes],
        "verses": rows,
    }


@router.get("/search")
def search(
    q: str = Query(..., min_length=2),
    translation: str = Query("KJV"),
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> dict:
    row = session.exec(
        select(Translation).where(Translation.code == translation.upper())
    ).first()
    if row is None:
        raise HTTPException(404, f"translation not loaded: {translation}")

    stmt = sql_text("""
        SELECT book_number, chapter, verse, text,
               ts_rank(to_tsvector('english', text),
                       plainto_tsquery('english', :q)) AS rank
        FROM verse
        WHERE translation_id = :tid
          AND to_tsvector('english', text) @@ plainto_tsquery('english', :q)
        ORDER BY rank DESC, book_number, chapter, verse
        LIMIT :lim
    """)
    results = session.exec(stmt, params={"q": q, "tid": row.id, "lim": limit}).all()
    return {
        "query": q,
        "translation": row.code,
        "count": len(results),
        "results": [
            {
                "ref": bs.format_ref(bs.Reference(r.book_number, r.chapter, r.verse, r.verse)),
                "book": bs.book_name(r.book_number),
                "chapter": r.chapter,
                "verse": r.verse,
                "text": r.text,
            }
            for r in results
        ],
    }
