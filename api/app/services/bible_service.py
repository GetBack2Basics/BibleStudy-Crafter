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
