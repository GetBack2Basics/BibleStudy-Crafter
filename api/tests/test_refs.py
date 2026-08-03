"""Task 7: reference parser. ~15 cases including malformed input."""
import pytest

from app.services.bible_service import Reference, format_ref, parse_ref


@pytest.mark.parametrize("text,expected", [
    ("John 3:16",            Reference(43, 3, 16, 16)),
    ("John 3:16-18",         Reference(43, 3, 16, 18)),
    ("Jn 3:16",              Reference(43, 3, 16, 16)),
    ("jn3:16",               Reference(43, 3, 16, 16)),
    ("1 Cor 13",             Reference(46, 13, 0, 0)),
    ("1 Corinthians 13:4-7", Reference(46, 13, 4, 7)),
    ("1Cor13:4",             Reference(46, 13, 4, 4)),
    ("I Corinthians 13",     Reference(46, 13, 0, 0)),
    ("First John 4:8",       Reference(62, 4, 8, 8)),
    ("Ps 23",                Reference(19, 23, 0, 0)),
    ("Ps 23:1-6",            Reference(19, 23, 1, 6)),
    ("Psalm 23:1",           Reference(19, 23, 1, 1)),
    ("Genesis 1:1",          Reference(1, 1, 1, 1)),
    ("Rev 22:21",            Reference(66, 22, 21, 21)),
    ("Matt. 5:3-12",         Reference(40, 5, 3, 12)),
    ("Song of Solomon 2:1",  Reference(22, 2, 1, 1)),
    ("John 3.16",            Reference(43, 3, 16, 16)),
    ("John 3:16\u201318",    Reference(43, 3, 16, 18)),   # en-dash
    ("  Luke  2 : 7  ",      Reference(42, 2, 7, 7)),
])
def test_parses_valid_references(text, expected):
    assert parse_ref(text) == expected


@pytest.mark.parametrize("bad", [
    "",                 # empty
    "   ",              # whitespace only
    "Hezekiah 3:1",     # no such book
    "John",             # no chapter
    "John 3:18-16",     # reversed range
    "John 0:1",         # chapter < 1
    "John 3:0",         # verse < 1
    "Corinthians 13",   # ambiguous (1 or 2)
    "3:16",             # no book
])
def test_rejects_malformed(bad):
    with pytest.raises(ValueError):
        parse_ref(bad)


def test_whole_chapter_flag():
    assert parse_ref("Ps 23").is_whole_chapter is True
    assert parse_ref("Ps 23:1").is_whole_chapter is False


@pytest.mark.parametrize("text,rendered", [
    ("Jn 3:16",     "John 3:16"),
    ("Jn 3:16-18",  "John 3:16-18"),
    ("1 Cor 13",    "1 Corinthians 13"),
])
def test_format_roundtrip(text, rendered):
    assert format_ref(parse_ref(text)) == rendered
