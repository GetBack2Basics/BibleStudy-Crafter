"""Pure parsing helpers for helloao.org payloads. No network, no DB - unit testable."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator, NamedTuple

# Protestant 66-book canon in helloao USFM ids, in canonical order.
CANON: list[tuple[int, str, str, str]] = [
    (1, "GEN", "Genesis", "OT"), (2, "EXO", "Exodus", "OT"), (3, "LEV", "Leviticus", "OT"),
    (4, "NUM", "Numbers", "OT"), (5, "DEU", "Deuteronomy", "OT"), (6, "JOS", "Joshua", "OT"),
    (7, "JDG", "Judges", "OT"), (8, "RUT", "Ruth", "OT"), (9, "1SA", "1 Samuel", "OT"),
    (10, "2SA", "2 Samuel", "OT"), (11, "1KI", "1 Kings", "OT"), (12, "2KI", "2 Kings", "OT"),
    (13, "1CH", "1 Chronicles", "OT"), (14, "2CH", "2 Chronicles", "OT"), (15, "EZR", "Ezra", "OT"),
    (16, "NEH", "Nehemiah", "OT"), (17, "EST", "Esther", "OT"), (18, "JOB", "Job", "OT"),
    (19, "PSA", "Psalms", "OT"), (20, "PRO", "Proverbs", "OT"), (21, "ECC", "Ecclesiastes", "OT"),
    (22, "SNG", "Song of Solomon", "OT"), (23, "ISA", "Isaiah", "OT"), (24, "JER", "Jeremiah", "OT"),
    (25, "LAM", "Lamentations", "OT"), (26, "EZK", "Ezekiel", "OT"), (27, "DAN", "Daniel", "OT"),
    (28, "HOS", "Hosea", "OT"), (29, "JOL", "Joel", "OT"), (30, "AMO", "Amos", "OT"),
    (31, "OBA", "Obadiah", "OT"), (32, "JON", "Jonah", "OT"), (33, "MIC", "Micah", "OT"),
    (34, "NAM", "Nahum", "OT"), (35, "HAB", "Habakkuk", "OT"), (36, "ZEP", "Zephaniah", "OT"),
    (37, "HAG", "Haggai", "OT"), (38, "ZEC", "Zechariah", "OT"), (39, "MAL", "Malachi", "OT"),
    (40, "MAT", "Matthew", "NT"), (41, "MRK", "Mark", "NT"), (42, "LUK", "Luke", "NT"),
    (43, "JHN", "John", "NT"), (44, "ACT", "Acts", "NT"), (45, "ROM", "Romans", "NT"),
    (46, "1CO", "1 Corinthians", "NT"), (47, "2CO", "2 Corinthians", "NT"),
    (48, "GAL", "Galatians", "NT"), (49, "EPH", "Ephesians", "NT"),
    (50, "PHP", "Philippians", "NT"), (51, "COL", "Colossians", "NT"),
    (52, "1TH", "1 Thessalonians", "NT"), (53, "2TH", "2 Thessalonians", "NT"),
    (54, "1TI", "1 Timothy", "NT"), (55, "2TI", "2 Timothy", "NT"), (56, "TIT", "Titus", "NT"),
    (57, "PHM", "Philemon", "NT"), (58, "HEB", "Hebrews", "NT"), (59, "JAS", "James", "NT"),
    (60, "1PE", "1 Peter", "NT"), (61, "2PE", "2 Peter", "NT"), (62, "1JN", "1 John", "NT"),
    (63, "2JN", "2 John", "NT"), (64, "3JN", "3 John", "NT"), (65, "JUD", "Jude", "NT"),
    (66, "REV", "Revelation", "NT"),
]

CODE_TO_NUMBER: dict[str, int] = {code: num for num, code, _, _ in CANON}


class ParsedVerse(NamedTuple):
    verse: int
    text: str
    words_of_jesus: bool


def _flatten(content: list[Any]) -> tuple[str, bool]:
    """helloao verse content is a mixed list of plain strings and
    {"text": ..., "wordsOfJesus": true} / {"noteId": N} objects.
    Returns (text, any_words_of_jesus)."""
    parts: list[str] = []
    woj = False
    for item in content:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict):
            if "text" in item:
                parts.append(str(item["text"]))
                woj = woj or bool(item.get("wordsOfJesus"))
            # {"noteId": ...} and other markers contribute no text
    text = " ".join(p.strip() for p in parts if p and p.strip())
    # Source texts (notably KJV) carry pilcrow paragraph markers - strip them
    # so verse text is clean prose for display, TTS and LLM prompts.
    text = text.replace("\u00b6", " ")
    return " ".join(text.split()), woj


def parse_chapter(payload: dict[str, Any]) -> Iterator[ParsedVerse]:
    """Yield ParsedVerse for every verse in a helloao chapter payload."""
    chapter = payload.get("chapter") or {}
    for item in chapter.get("content", []):
        if not isinstance(item, dict) or item.get("type") != "verse":
            continue          # skip heading / line_break / hebrew_subtitle
        number = item.get("number")
        if number is None:
            continue
        text, woj = _flatten(item.get("content", []))
        if text:
            yield ParsedVerse(int(number), text, woj)


def load_allowlist(path: str | Path) -> dict[str, str]:
    """Parse translations.txt -> {LOCAL_CODE: helloao_source_id}."""
    out: dict[str, str] = {}
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or "=" not in line:
            continue
        code, source = (p.strip() for p in line.split("=", 1))
        if code and source:
            out[code] = source
    return out
