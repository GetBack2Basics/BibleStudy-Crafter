"""Task 11b: tradition lens + imagery policy enforced at the prompt chokepoint."""
import pytest

from app.services.prompts import (
    IMAGERY_POLICIES,
    TRADITIONS,
    build_system,
    get_tradition,
    list_traditions,
)


def test_each_tradition_yields_a_distinct_system_prompt():
    prompts = {k: build_system(tradition=k) for k in TRADITIONS}
    assert len(set(prompts.values())) == len(TRADITIONS)
    assert "Westminster" in prompts["reformed"]
    assert "Catechism" in prompts["catholic"]
    assert "theosis" in prompts["orthodox"]
    assert "Book of Common Prayer" in prompts["anglican"]
    assert "believer's baptism" in prompts["baptist"]
    assert "Quadrilateral" in prompts["methodist"]


@pytest.mark.parametrize("bad", ["jedi", "", None, "not_a_tradition", "  ", "REFORMEDish"])
def test_unknown_tradition_falls_back_without_raising(bad):
    t = get_tradition(bad)
    assert t.key == "non_denominational"
    assert "ecumenical" in build_system(tradition=bad)


@pytest.mark.parametrize("given,expected", [
    ("Reformed", "reformed"),
    ("CATHOLIC", "catholic"),
    ("non-denominational", "non_denominational"),
    (" orthodox ", "orthodox"),
])
def test_tradition_keys_are_normalised(given, expected):
    assert get_tradition(given).key == expected


def test_symbolic_imagery_is_the_default_and_forbids_jesus_face():
    prompt = build_system()
    assert "Never depict the face of Jesus Christ" in prompt
    assert "symbolic or environmental" in prompt


def test_figurative_still_avoids_the_face_of_christ():
    """Even the permissive policy keeps the one hard rule."""
    assert "face of Jesus Christ" in IMAGERY_POLICIES["figurative"]


def test_imagery_can_be_disabled_entirely():
    assert "text-based aids only" in build_system(imagery_policy="none")


def test_imagery_section_omitted_for_text_only_calls():
    assert "IMAGERY POLICY" not in build_system(include_imagery=False)


def test_anti_hallucination_rule_is_always_present():
    """Non-negotiable: the model must never supply verse text."""
    for key in TRADITIONS:
        p = build_system(tradition=key)
        assert "never write out the words of a Bible verse" in p
        assert "will be discarded" in p


def test_list_traditions_exposes_all_eight_for_the_ui():
    listed = list_traditions()
    assert len(listed) == 8
    assert listed[0]["key"] == "non_denominational"     # default first
    assert all(t["label"] for t in listed)
