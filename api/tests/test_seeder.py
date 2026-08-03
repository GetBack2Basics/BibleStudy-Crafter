"""Task 5: seeder parsing against a real captured helloao payload (no network)."""
import json
from pathlib import Path

from app.seeder.parsing import CANON, CODE_TO_NUMBER, load_allowlist, parse_chapter

FIXTURE = Path(__file__).parent / "fixtures" / "helloao_jhn3.json"


def _verses():
    return list(parse_chapter(json.loads(FIXTURE.read_text(encoding="utf-8"))))


def test_parses_helloao_chapter_fixture():
    verses = _verses()
    assert len(verses) == 26
    assert verses[0].verse == 1
    assert verses[0].text.startswith("There was a man of the Pharisees")
    assert verses[-1].verse == 26


def test_flattens_mixed_string_and_object_content():
    """John 3:16 mixes plain strings with {"text":..., "wordsOfJesus":true} objects."""
    v16 = next(v for v in _verses() if v.verse == 16)
    assert "God so loved the world" in v16.text
    assert "everlasting life" in v16.text
    assert "{" not in v16.text and "[" not in v16.text     # no raw JSON leaked
    assert "  " not in v16.text                            # whitespace normalised


def test_words_of_jesus_flagged():
    verses = {v.verse: v for v in _verses()}
    assert verses[3].words_of_jesus is True     # "Verily, verily, I say unto thee..."
    assert verses[1].words_of_jesus is False    # narration


def test_pilcrow_markers_stripped():
    """KJV source carries paragraph pilcrows; verse text must be clean prose."""
    for v in _verses():
        assert "\u00b6" not in v.text
    v16 = next(v for v in _verses() if v.verse == 16)
    assert v16.text.startswith("For God so loved the world")


def test_skips_non_verse_content():
    """Headings / line breaks must not become verses."""
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    payload["chapter"]["content"].insert(0, {"type": "heading", "content": ["Jesus and Nicodemus"]})
    payload["chapter"]["content"].insert(1, {"type": "line_break"})
    assert len(list(parse_chapter(payload))) == 26


def test_canon_is_66_books_and_maps_codes():
    assert len(CANON) == 66
    assert CODE_TO_NUMBER["GEN"] == 1
    assert CODE_TO_NUMBER["JHN"] == 43
    assert CODE_TO_NUMBER["REV"] == 66
    assert len({c for _, c, _, _ in CANON}) == 66


def test_allowlist_parses_and_ignores_comments():
    path = Path(__file__).resolve().parents[1] / "app" / "seeder" / "translations.txt"
    allow = load_allowlist(path)
    assert allow["KJV"] == "eng_kjv"
    assert allow["WEB"] == "ENGWEBP"
    assert all("#" not in v for v in allow.values())
