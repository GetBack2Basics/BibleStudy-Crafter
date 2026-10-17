"""Historical plates matching service for Bible.ca and KnowingTheBible maps.

Matches scripture references, OSIS books, historical periods, locations,
and study text against the pre-compiled catalog of historical cartographic plates.
Preserves full attribution, backlink to source pages, and author credit.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

_INDEX_CACHE: Optional[Dict[str, Any]] = None

DEFAULT_BIBLE_CA = {
    "title": "Bible.ca 100 Free Printable Public Use Bible Maps",
    "url": "https://www.bible.ca/maps/",
    "source_name": "Bible.ca",
    "source_url": "https://www.bible.ca/maps/",
    "attribution": "Courtesy of Steve Rudd / Bible.ca (100 Free Printable Public Use Bible Maps for personal and church study)."
}

DEFAULT_KNOWING_THE_BIBLE = {
    "title": "Knowing The Bible Maps Archive",
    "url": "https://www.knowingthebible.net/bible-maps",
    "source_name": "Knowing The Bible",
    "source_url": "https://www.knowingthebible.net/bible-maps",
    "attribution": "Courtesy of KnowingTheBible.net Bible Maps Archive."
}


def _load_index() -> Dict[str, Any]:
    global _INDEX_CACHE
    if _INDEX_CACHE is not None:
        return _INDEX_CACHE

    index_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "historical_maps_index.json")
    if os.path.exists(index_path):
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                _INDEX_CACHE = json.load(f)
                return _INDEX_CACHE
        except Exception:
            pass

    _INDEX_CACHE = {"collections": {"bible_ca": {"maps": []}, "knowing_the_bible": {"maps": []}}}
    return _INDEX_CACHE


def _score_candidate(
    cand: Dict[str, Any],
    primary_book: str,
    osis_code: str,
    period_key: str,
    location_names: List[str],
    text_corpus: str
) -> int:
    score = 0
    osis_code_lower = osis_code.lower()
    cand_osis = [c.lower() for c in cand.get("osis_codes", [])]
    cand_books = [b.lower() for b in cand.get("books", [])]

    # Exact OSIS or book match
    if osis_code_lower and osis_code_lower in cand_osis:
        score += 100
    elif primary_book and primary_book.lower() in cand_books:
        score += 80

    # Period match
    cand_periods = [p.lower() for p in cand.get("periods", [])]
    if period_key.lower() in cand_periods:
        score += 40

    # Location matches
    cand_locations = [loc.lower() for loc in cand.get("locations", [])]
    for loc in location_names:
        if loc.lower() in cand_locations:
            score += 25

    # Keyword matches in text
    cand_keywords = [k.lower() for k in cand.get("keywords", [])]
    for kw in cand_keywords:
        if len(kw) > 3 and kw in text_corpus:
            score += 15

    return score


def match_historical_plates(
    primary_book: str = "Matthew",
    osis_code: str = "matt",
    period_key: str = "roman_judea",
    locations: Optional[List[Any]] = None,
    text: str = ""
) -> Dict[str, Any]:
    """Matches the current study context with direct historical map plates.

    Returns:
        Dict with 'bible_ca' and 'knowing_the_bible' entries containing:
        - title: Specific plate title (e.g., 'The Ministry of Jesus in Galilee & Judea')
        - url: Direct URL to the plate/study
        - source_name: 'Bible.ca' or 'Knowing The Bible'
        - source_url: Link back to the parent atlas/archive homepage
        - attribution: Full attribution with author/source credit
    """
    index = _load_index()
    collections = index.get("collections", {})

    # Extract location name strings
    loc_names: List[str] = []
    if locations:
        for loc in locations:
            if isinstance(loc, dict) and "name" in loc:
                loc_names.append(loc["name"])
            elif isinstance(loc, str):
                loc_names.append(loc)

    text_corpus = f"{primary_book} {osis_code} {period_key} {' '.join(loc_names)} {text}".lower()

    # Match Bible.ca
    bca_candidates = collections.get("bible_ca", {}).get("maps", [])
    best_bca = None
    best_bca_score = 0
    for cand in bca_candidates:
        sc = _score_candidate(cand, primary_book, osis_code, period_key, loc_names, text_corpus)
        if sc > best_bca_score:
            best_bca_score = sc
            best_bca = cand

    if best_bca and best_bca_score >= 40:
        bible_ca_result = {
            "title": best_bca["title"],
            "url": best_bca["url"],
            "source_name": "Bible.ca",
            "source_url": "https://www.bible.ca/maps/",
            "attribution": "Courtesy of Steve Rudd / Bible.ca (100 Free Printable Public Use Bible Maps for personal and church study)."
        }
    else:
        bible_ca_result = dict(DEFAULT_BIBLE_CA)

    # Match Knowing The Bible
    ktb_candidates = collections.get("knowing_the_bible", {}).get("maps", [])
    best_ktb = None
    best_ktb_score = 0
    for cand in ktb_candidates:
        sc = _score_candidate(cand, primary_book, osis_code, period_key, loc_names, text_corpus)
        if sc > best_ktb_score:
            best_ktb_score = sc
            best_ktb = cand

    if best_ktb and best_ktb_score >= 40:
        ktb_result = {
            "title": best_ktb["title"],
            "url": best_ktb["url"],
            "source_name": "Knowing The Bible",
            "source_url": "https://www.knowingthebible.net/bible-maps",
            "attribution": "Courtesy of KnowingTheBible.net Bible Maps Archive."
        }
    else:
        ktb_result = dict(DEFAULT_KNOWING_THE_BIBLE)

    return {
        "bible_ca": bible_ca_result,
        "knowing_the_bible": ktb_result
    }
