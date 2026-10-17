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

