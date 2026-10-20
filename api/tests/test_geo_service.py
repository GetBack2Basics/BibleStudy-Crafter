import pytest
from app.services import geo_service


def test_extract_locations_from_text():
    text = "Jesus traveled from Nazareth to Capernaum near the Sea of Galilee and then went up to Jerusalem."
    found = geo_service.extract_locations_from_text(text)
    assert "nazareth" in found
    assert "capernaum" in found
    assert "sea of galilee" in found
    assert "jerusalem" in found


def test_determine_biblical_era_gospels():
    passages = [{"book": "Matthew", "ref": "Matthew 5:1", "text": "Seeing the crowds..."}]
    era = geo_service.determine_biblical_era(passages)
    assert era["period_key"] == "roman_judea"
    assert "defaults" in era


def test_determine_biblical_era_exodus():
    passages = [{"book": "Exodus", "ref": "Exodus 20:1", "text": "And God spoke all these words..."}]
    era = geo_service.determine_biblical_era(passages)
    assert era["period_key"] == "exodus"
    assert "mount sinai" in era["defaults"]


def test_resolve_day_maps():
    commentary = "Paul was in Corinth and wrote to the believers in Rome."
    passages = [{"book": "Romans", "ref": "Romans 1:1", "text": "Paul, a servant..."}]
    res = geo_service.resolve_day_maps(commentary, passages)

    assert res["status"] == "ready"
    assert res["has_locations"] is True
    assert "corinth" in [loc["name"].lower() for loc in res["locations"]]
    assert "rome" in [loc["name"].lower() for loc in res["locations"]]
    assert len(res["center"]) == 2
    assert "public_maps_refs" in res

    # Verify OpenBible Authoritative integration
    assert res.get("book_kml_url") == "https://a.openbible.info/geo/kmls/rom.kml"
    assert "https://www.openbible.info/geo/preview/rom.1" in (res.get("openbible_preview_url") or "")
    
    # Verify location photo and OpenBible metadata
    rome_loc = next(loc for loc in res["locations"] if loc["name"].lower() == "rome")
    assert rome_loc.get("openbible_id") == "afc8e7a"
    assert "https://www.openbible.info/geo/ancient/afc8e7a/rome" in (rome_loc.get("openbible_url") or "")
    assert rome_loc.get("photo_url") is not None
    assert rome_loc.get("photo_credit") is not None

    # Verify Historical Plates direct links and attribution
    plates = res.get("historical_plates", {})
    assert "bible_ca" in plates
    assert "knowing_the_bible" in plates
    assert "https://www.bible.ca/" in plates["bible_ca"]["url"]
    assert "https://www.knowingthebible.net/" in plates["knowing_the_bible"]["url"]
    assert "Steve Rudd" in plates["bible_ca"]["attribution"]
    assert "KnowingTheBible.net" in plates["knowing_the_bible"]["attribution"]


def test_historical_plates_exodus_matching():
    commentary = "Israel crossed the Red Sea and camped at Mount Sinai."
    passages = [{"book": "Exodus", "ref": "Exodus 14:21", "text": "Then Moses stretched out his hand over the sea..."}]
    res = geo_service.resolve_day_maps(commentary, passages)
    plates = res["historical_plates"]

    # Bible.ca should match the specific Exodus map directly
    assert "maps-the-exodus" in plates["bible_ca"]["url"]
    assert "Exodus" in plates["bible_ca"]["title"]
    assert plates["bible_ca"]["source_url"] == "https://www.bible.ca/maps/"

    # Knowing The Bible should match Exodus map directly
    assert "israels-exodus-and-wanderings" in plates["knowing_the_bible"]["url"]
    assert "Exodus" in plates["knowing_the_bible"]["title"]
    assert plates["knowing_the_bible"]["source_url"] == "https://www.knowingthebible.net/bible-maps"


def test_historical_plates_gospel_matching():
    commentary = "Jesus was teaching in Capernaum by the Sea of Galilee."
    passages = [{"book": "Matthew", "ref": "Matthew 4:13", "text": "Leaving Nazareth he went and lived in Capernaum..."}]
    res = geo_service.resolve_day_maps(commentary, passages)
    plates = res["historical_plates"]

    # Bible.ca matches Jesus Ministry
    assert "maps-ministry-of-jesus" in plates["bible_ca"]["url"]
    assert "Jesus" in plates["bible_ca"]["title"]

    # Knowing The Bible matches Israel During Time of Jesus
    assert "israel-during-the-time-of-jesus" in plates["knowing_the_bible"]["url"]


def test_parse_locations_acts_2_pentecost():
    acts_2_text = (
        '7 Utterly amazed, they asked: “Aren’t all these who are speaking Galileans? '
        '8 Then how is it that each of us hears them in our native language? '
        '9 Parthians, Medes and Elamites; residents of Mesopotamia, Judea and Cappadocia, '
        'Pontus and Asia,[[b](https://www.biblegateway.com/passage/?search=Acts%202&version=NIV#fen-NIV-26959b)] '
        '10 Phrygia and Pamphylia, Egypt and the parts of Libya near Cyrene; visitors from Rome '
        '11 (both Jews and converts to Judaism); Cretans and Arabs—we hear them declaring the wonders '
        'of God in our own tongues!” 12 Amazed and perplexed, they asked one another, “What does this mean?”'
    )
    detected = geo_service.parse_locations_from_text(acts_2_text)
    names = {loc["name"].lower() for loc in detected}

    # Verify all expected regions & places from Acts 2:7-12 are resolved
    expected = [
        "galilee", "parthia", "media", "elam", "mesopotamia", "judea",
        "cappadocia", "pontus", "asia", "phrygia", "pamphylia",
        "egypt", "libya", "cyrene", "rome", "crete", "arabia"
    ]
    for exp in expected:
        assert exp in names, f"Expected {exp} to be parsed from Acts 2 text"

    # Test update_day_maps_with_locations
    initial_maps = {
        "status": "ready",
        "locations": [{"name": "Jerusalem", "lat": 31.77, "lng": 35.23}],
        "period": "early_church"
    }
    updated = geo_service.update_day_maps_with_locations(initial_maps, detected)
    assert updated["has_locations"] is True
    assert len(updated["locations"]) >= len(expected)
    assert "center" in updated
    assert "bounds" in updated
    assert "modern_map_url" in updated
    assert "ancient_map_url" in updated


