"""Bible reference parsing and passage lookup.

parse_ref("John 3:16-18") -> Reference(book=43, chapter=3, verse_start=16, verse_end=18)

The LLM is only ever trusted to produce a *reference*; the verse text itself is
resolved from the local database. That is the anti-hallucination guarantee.
"""
from __future__ import annotations

import re
from typing import NamedTuple

from app.seeder.parsing import CANON

MAX_VERSE = 200


class Reference(NamedTuple):
    book: int              # 1..66
    chapter: int
    verse_start: int       # 0 => whole chapter
    verse_end: int         # 0 => whole chapter

    @property
    def is_whole_chapter(self) -> bool:
        return self.verse_start == 0

    @property
    def book_name(self) -> str:
        return _NUM_TO_NAME.get(self.book, "")

    @property
    def ref(self) -> str:
        """Canonical display form, e.g. 'John 3:16-18' or 'Psalm 23'."""
        name = self.book_name
        if self.is_whole_chapter:
            return f"{name} {self.chapter}"
        if self.verse_end and self.verse_end != self.verse_start:
            return f"{name} {self.chapter}:{self.verse_start}-{self.verse_end}"
        return f"{name} {self.chapter}:{self.verse_start}"


# ---------------------------------------------------------------- name lookup

_ALIASES: dict[str, str] = {
    # Pentateuch / history
    "gen": "GEN", "ge": "GEN", "gn": "GEN",
    "exo": "EXO", "ex": "EXO", "exod": "EXO",
    "lev": "LEV", "lv": "LEV", "num": "NUM", "nm": "NUM", "nb": "NUM",
    "deu": "DEU", "dt": "DEU", "deut": "DEU",
    "jos": "JOS", "josh": "JOS", "jdg": "JDG", "judg": "JDG", "jg": "JDG",
    "rut": "RUT", "ru": "RUT",
    "1sa": "1SA", "1sam": "1SA", "1s": "1SA", "2sa": "2SA", "2sam": "2SA", "2s": "2SA",
    "1ki": "1KI", "1kg": "1KI", "1kgs": "1KI", "2ki": "2KI", "2kg": "2KI", "2kgs": "2KI",
    "1ch": "1CH", "1chr": "1CH", "1chron": "1CH",
    "2ch": "2CH", "2chr": "2CH", "2chron": "2CH",
    "ezr": "EZR", "neh": "NEH", "ne": "NEH", "est": "EST", "esth": "EST",
    # Wisdom
    "job": "JOB", "jb": "JOB",
    "psa": "PSA", "ps": "PSA", "psalm": "PSA", "psalms": "PSA", "pss": "PSA",
    "pro": "PRO", "prov": "PRO", "pr": "PRO", "prv": "PRO",
    "ecc": "ECC", "eccl": "ECC", "qoh": "ECC",
    "sng": "SNG", "song": "SNG", "sos": "SNG", "canticles": "SNG",
    "songofsolomon": "SNG", "songofsongs": "SNG",
    # Prophets
    "isa": "ISA", "is": "ISA", "jer": "JER", "je": "JER",
    "lam": "LAM", "la": "LAM", "ezk": "EZK", "eze": "EZK", "ezek": "EZK",
    "dan": "DAN", "dn": "DAN", "hos": "HOS", "ho": "HOS",
    "jol": "JOL", "joel": "JOL", "amo": "AMO", "am": "AMO",
    "oba": "OBA", "obad": "OBA", "ob": "OBA",
    "jon": "JON", "jnh": "JON", "mic": "MIC", "mi": "MIC",
    "nam": "NAM", "nah": "NAM", "hab": "HAB", "hb": "HAB",
    "zep": "ZEP", "zeph": "ZEP", "hag": "HAG", "hg": "HAG",
    "zec": "ZEC", "zech": "ZEC", "mal": "MAL", "ml": "MAL",
    # Gospels / Acts
    "mat": "MAT", "matt": "MAT", "mt": "MAT",
    "mrk": "MRK", "mark": "MRK", "mk": "MRK", "mr": "MRK",
    "luk": "LUK", "luke": "LUK", "lk": "LUK",
    "jhn": "JHN", "john": "JHN", "jn": "JHN", "joh": "JHN",
    "act": "ACT", "acts": "ACT", "ac": "ACT",
    # Epistles
    "rom": "ROM", "ro": "ROM", "rm": "ROM",
    "1co": "1CO", "1cor": "1CO", "2co": "2CO", "2cor": "2CO",
    "gal": "GAL", "ga": "GAL", "eph": "EPH", "ep": "EPH",
    "php": "PHP", "phil": "PHP", "pp": "PHP", "philippians": "PHP",
    "col": "COL", "1th": "1TH", "1thes": "1TH", "1thess": "1TH",
    "2th": "2TH", "2thes": "2TH", "2thess": "2TH",
    "1ti": "1TI", "1tim": "1TI", "2ti": "2TI", "2tim": "2TI",
    "tit": "TIT", "ti": "TIT", "phm": "PHM", "phlm": "PHM", "philemon": "PHM",
    "heb": "HEB", "hb2": "HEB", "jas": "JAS", "jam": "JAS", "james": "JAS",
    "1pe": "1PE", "1pet": "1PE", "1pt": "1PE", "2pe": "2PE", "2pet": "2PE", "2pt": "2PE",
    "1jn": "1JN", "1jo": "1JN", "1john": "1JN",
    "2jn": "2JN", "2jo": "2JN", "2john": "2JN",
    "3jn": "3JN", "3jo": "3JN", "3john": "3JN",
    "jud": "JUD", "jude": "JUD",
    "rev": "REV", "re": "REV", "apoc": "REV", "revelation": "REV",
}

_CODE_TO_NUM = {code: num for num, code, _, _ in CANON}
_NAME_TO_NUM = {name.lower().replace(" ", ""): num for num, _, name, _ in CANON}
_NUM_TO_NAME = {num: name for num, _, name, _ in CANON}
_NUM_TO_CODE = {num: code for num, code, _, _ in CANON}

# Ordinal prefixes: "1st John", "First Corinthians", "I Cor", "II Tim", "III John"
_ORDINALS = {
    "first": "1", "1st": "1", "i": "1",
    "second": "2", "2nd": "2", "ii": "2",
    "third": "3", "3rd": "3", "iii": "3",
}

_REF_RE = re.compile(
    r"""^\s*
    (?P<book>.+?)\s*
    (?P<chapter>\d+)
    (?:\s*[:.]\s*(?P<vstart>\d+)
        (?:\s*[-\u2013\u2014]\s*(?P<vend>\d+))?
    )?
    \s*$""",
    re.VERBOSE,
)


def _normalise_book(raw: str) -> int:
    """Book name / abbreviation -> canonical book number. Raises ValueError."""
    s = raw.strip().lower().replace(".", " ")
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        raise ValueError("empty book name")

    # Expand a leading ordinal word/numeral: "first john" -> "1john"
    parts = s.split(" ", 1)
    if len(parts) == 2 and parts[0] in _ORDINALS:
        s = _ORDINALS[parts[0]] + parts[1]
    s = s.replace(" ", "")

    if s in _NAME_TO_NUM:
        return _NAME_TO_NUM[s]
    if s in _ALIASES:
        return _CODE_TO_NUM[_ALIASES[s]]
    if s.upper() in _CODE_TO_NUM:
        return _CODE_TO_NUM[s.upper()]
    # Unique prefix match, e.g. "revelati", "corinth" is ambiguous and rejected
    hits = {num for name, num in _NAME_TO_NUM.items() if name.startswith(s)}
    if len(hits) == 1:
        return hits.pop()
    raise ValueError(f"unknown book: {raw!r}")


def parse_ref(text: str) -> Reference:
    """Parse a human reference. Whole-chapter refs get verse_start/end == 0."""
    if not text or not text.strip():
        raise ValueError("empty reference")

    m = _REF_RE.match(text.replace("\u00a0", " "))
    if not m:
        raise ValueError(f"cannot parse reference: {text!r}")

    book = _normalise_book(m.group("book"))
    chapter = int(m.group("chapter"))
    if chapter < 1:
        raise ValueError("chapter must be >= 1")

    vs_raw, ve_raw = m.group("vstart"), m.group("vend")
    if vs_raw is None:
        return Reference(book, chapter, 0, 0)

    vstart = int(vs_raw)
    vend = int(ve_raw) if ve_raw is not None else vstart
    if vstart < 1:
        raise ValueError("verse must be >= 1")
    if vend < vstart:
        raise ValueError(f"verse range reversed: {vstart}-{vend}")
    if vend - vstart > MAX_VERSE:
        raise ValueError("verse range too large")
    return Reference(book, chapter, vstart, vend)


def safe_parse_ref(text: str) -> Reference | None:
    """Like parse_ref but returns None instead of raising - used where a model
    may emit a bad reference and we want to silently drop it rather than fail
    the whole draft."""
    try:
        return parse_ref(text)
    except ValueError:
        return None


def format_ref(ref: Reference) -> str:
    name = _NUM_TO_NAME[ref.book]
    if ref.is_whole_chapter:
        return f"{name} {ref.chapter}"
    if ref.verse_start == ref.verse_end:
        return f"{name} {ref.chapter}:{ref.verse_start}"
    return f"{name} {ref.chapter}:{ref.verse_start}-{ref.verse_end}"


def book_name(number: int) -> str:
    return _NUM_TO_NAME[number]


def book_code(number: int) -> str:
    return _NUM_TO_CODE[number]


# ------------------------------------------------------------ passage lookup

def get_passage(session, ref: Reference, translation_code: str) -> list[dict]:
    """Resolve a reference to verse rows from the LOCAL database.

    This is the only path by which scripture text reaches the user. The LLM
    never supplies verse text - only references, which land here.
    """
    from sqlmodel import select

    from app.models import Translation, Verse

    translation = session.exec(
        select(Translation).where(Translation.code == translation_code.upper())
    ).first()
    if translation is None:
        raise LookupError(f"translation not loaded: {translation_code}")

    stmt = (
        select(Verse)
        .where(Verse.translation_id == translation.id)
        .where(Verse.book_number == ref.book)
        .where(Verse.chapter == ref.chapter)
    )
    if not ref.is_whole_chapter:
        stmt = stmt.where(Verse.verse >= ref.verse_start, Verse.verse <= ref.verse_end)
    stmt = stmt.order_by(Verse.verse)

    return [
        {"verse": v.verse, "text": v.text, "words_of_jesus": v.words_of_jesus}
        for v in session.exec(stmt).all()
    ]


def get_comparison(session, ref: Reference, codes: list[str]) -> list[dict]:
    """Verse-aligned multi-translation rows: [{verse, texts:{CODE: text}}]."""
    per_code: dict[str, dict[int, str]] = {}
    for code in codes:
        try:
            per_code[code.upper()] = {
                row["verse"]: row["text"] for row in get_passage(session, ref, code)
            }
        except LookupError:
            continue

    verse_numbers = sorted({n for rows in per_code.values() for n in rows})
    return [
        {"verse": n, "texts": {code: rows.get(n, "") for code, rows in per_code.items()}}
        for n in verse_numbers
    ]


# ------------------------------------------------ extraction & scripture coverage

def extract_bible_refs(text: str) -> list[Reference]:
    """Find all valid Bible references cited in arbitrary text.

    Returns a list of parsed Reference objects in order of appearance,
    ignoring false positives that fail safe_parse_ref.
    """
    if not text:
        return []
    found: list[Reference] = []
    seen: set[tuple[int, int, int, int]] = set()

    # Find candidate chapter/verse blocks
    for m in re.finditer(r"\b\d+(?:[:.]\d+(?:[-–—]\d+)?)?\b", text):
        start_idx = m.start()
        cv_part = m.group(0)
        # Look behind up to 40 characters for book words
        lead = text[max(0, start_idx - 40):start_idx]
        words = re.findall(r"[A-Za-z0-9]+", lead)
        parsed = None
        for w_count in (3, 2, 1):
            if len(words) >= w_count:
                candidate = " ".join(words[-w_count:]) + " " + cv_part
                parsed = safe_parse_ref(candidate)
                if parsed is not None:
                    break
        if parsed is not None:
            key = (parsed.book, parsed.chapter, parsed.verse_start, parsed.verse_end)
            if key not in seen:
                seen.add(key)
                found.append(parsed)

    return found


def is_ref_covered(ref: Reference, existing: list[Reference]) -> bool:
    """Check if `ref` is fully covered by any reference in `existing`."""
    for ex in existing:
        if ex.book != ref.book or ex.chapter != ref.chapter:
            continue
        if ex.is_whole_chapter:
            return True
        if ref.is_whole_chapter:
            continue
        ex_end = ex.verse_end or ex.verse_start
        ref_end = ref.verse_end or ref.verse_start
        if ex.verse_start <= ref.verse_start and ref_end <= ex_end:
            return True
    return False


def resolve_ref_text(ref: Reference, translation: str = "KJV", session=None) -> str:
    """Resolve verse text for a reference. Uses existing session if provided,
    otherwise opens one with get_engine()."""
    from sqlmodel import Session
    from app.db import get_engine
    if session is not None:
        try:
            rows = get_passage(session, ref, translation)
            return " ".join(v["text"] for v in rows)
        except Exception:
            return ""
    try:
        with Session(get_engine()) as s:
            rows = get_passage(s, ref, translation)
            return " ".join(v["text"] for v in rows)
    except Exception:
        return ""


def ensure_scriptures_include_mentioned(
    scripture_blocks: list[dict],
    text_sources: list[str],
    translation: str = "KJV",
    session=None,
) -> list[dict]:
    """Ensure that `scripture_blocks` contains all verses mentioned across `text_sources`.

    Any referenced verse not already covered is resolved from the Bible database
    and appended as a scripture block.
    """
    blocks = list(scripture_blocks or [])
    existing_refs: list[Reference] = []
    for blk in blocks:
        parsed = safe_parse_ref(blk.get("ref", ""))
        if parsed is not None:
            existing_refs.append(parsed)

    for src in text_sources:
        if not src:
            continue
        for ref in extract_bible_refs(src):
            if not is_ref_covered(ref, existing_refs):
                text = resolve_ref_text(ref, translation, session=session)
                blocks.append({
                    "ref": ref.ref,
                    "book": ref.book_name,
                    "text": text,
                    "translation": translation,
                    "rationale": f"Referenced in study content ({ref.ref})",
                })
                existing_refs.append(ref)

    return blocks

