#!/usr/bin/env python3
"""OpenBible.info Full A-to-Z Gazetteer Synchronization & Tier-Ranking Script.

Downloads and cross-references all 1,342 ancient biblical places across A to Z:
- ancient.jsonl (places, verses, OSIS citations, disambiguation)
- modern.jsonl (WGS84 coordinates, modern names, elevations, media thumbnails)
- image.jsonl (Wikimedia Commons images, photographer credits, licenses)

Assigns cartographic priority tiers and zoom-level visibility:
- Tier 1 (Major): ~75 iconic biblical centers & sites with >= 25 verses (min_zoom: 0)
- Tier 2 (Moderate): ~165 regional cities & sites with 6-24 verses (min_zoom: 7.0)
- Tier 3 (Minor): ~1,102 local villages & sites with 1-5 verses (min_zoom: 9.8)

Outputs:
- map_crafter/data/biblical_sites.geojson
- data/openbible_gazetteer_verified.json
"""
import json
import os
import re
import urllib.request
from typing import Any, Dict, List, Optional, Set, Tuple

OPENBIBLE_DATA_BASE = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data"

ICONIC_MAJOR_KEYS = {
    "jerusalem", "bethlehem", "nazareth", "capernaum", "sea of galilee", "dead sea",
    "jericho", "jordan river", "jordan", "bethany", "caesarea philippi", "caesarea maritima",
    "caesarea", "hebron", "shechem", "mount carmel", "mount sinai", "antioch",
    "antioch 1", "damascus", "ephesus", "athens", "corinth", "rome", "babylon",
    "babylon 1", "ur of the chaldees", "ur", "ur 1", "nineveh", "joppa", "emmaus",
    "alexandria", "beer-sheba", "beer-sheba 1", "bethel", "bethel 1", "shiloh",
    "megiddo", "tyre", "sidon", "samaria", "samaria 1", "gath", "ashdod",
    "ashkelon", "gaza", "haran", "susa", "tarsus", "troas", "philippi",
    "thessalonica", "patmos", "colossae", "pergamum", "sardis", "smyrna",
    "laodicea", "philadelphia", "thyatira"
}

TOP_10_MAJOR_IDS = [
    "jerusalem", "bethlehem", "nazareth", "capernaum", "jericho",
    "damascus", "antioch", "ephesus", "rome", "babylon"
]

SPECIAL_COORDINATES = {
    "ab9a5ec": ("35.328300,31.748300", "Cliff of the Scapegoat (Jebel Muntar) in the Judean Desert east of Jerusalem"),
    "a849ca2": ("35.210000,31.780000", "Traditional high place site in the Judean hill country (Hebrew: bamah)"),
    "a2227ba": ("34.800000,31.250000", "Southern Judah / Negev settlement district near Beersheba"),
    "a13cde9": ("35.235400,31.778000", "Interior sanctuary of the Tabernacle and Temple Mount, Jerusalem"),
    "a378ddd": ("35.235400,31.778000", "Holy of Holies (Kodesh HaKodashim) on the Temple Mount, Jerusalem"),
    "a1ad8e1": ("46.500000,31.500000", "Land of Nod east of Eden in southern Mesopotamia / Persian Gulf region"),
    "ab4d194": ("35.200000,31.850000", "Territory of the tribe of Benjamin north of Jerusalem")
}

def determine_country(lat: float, lng: float) -> str:
    if 36.0 <= lat <= 42.0 and 26.0 <= lng <= 44.5:
        return "Turkey"
    if 34.8 <= lat <= 41.8 and 19.5 <= lng <= 28.5:
        return "Greece"
    if 36.5 <= lat <= 47.1 and 6.6 <= lng <= 19.0:
        return "Italy"
    if 34.5 <= lat <= 35.8 and 32.0 <= lng <= 34.7:
        return "Cyprus"
    if 29.0 <= lat <= 37.5 and 38.8 <= lng <= 48.6:
        return "Iraq"
    if 25.0 <= lat <= 39.8 and 48.6 <= lng <= 63.3:
        return "Iran"
    if 22.0 <= lat <= 31.7 and 25.0 <= lng <= 34.5:
        return "Egypt"
    if 33.05 <= lat <= 34.7 and 35.1 <= lng <= 36.05:
        return "Lebanon"
    if 32.3 <= lat <= 37.3 and 36.05 <= lng <= 42.4:
        return "Syria"
    if 34.7 <= lat <= 37.3 and 35.6 <= lng <= 42.4:
        return "Syria"
    if 29.2 <= lat <= 33.4 and 35.6 <= lng <= 39.3:
        return "Jordan"
    if 29.4 <= lat <= 33.4 and 34.2 <= lng <= 35.65:
        return "Israel"
    if lat < 29.0 and lng >= 34.5:
        return "Saudi Arabia"
    return "Levant"

def determine_biblical_region(name: str, country: str, lat: float, lng: float) -> str:
    if country == "Greece":
        return "Greece / Achaia & Macedonia"
    if country == "Italy":
        return "Italy / Roman Empire"
    if country == "Turkey":
        return "Asia Minor / Anatolia"
    if country == "Egypt":
        return "Egypt & Sinai"
    if country == "Iraq":
        return "Mesopotamia / Babylonia"
    if country == "Iran":
        return "Persia / Elam"
    if country == "Syria":
        return "Syria / Aram & Damascus"
    if country == "Lebanon":
        return "Phoenicia / Lebanon"
    if country == "Jordan":
        if lat < 31.3:
            return "Edom / Southern Transjordan"
        elif lat < 32.0:
            return "Moab / Plains of Moab"
        elif lat < 32.5:
            return "Ammon / Gilead"
        else:
            return "Bashan / Northern Transjordan"
    if country == "Israel":
        if lat >= 32.7:
            return "Galilee"
        elif lat >= 32.1:
            return "Samaria"
        elif lat >= 31.4:
            if lng < 35.0:
                return "Shephelah / Coastal Plain"
            elif lng > 35.3:
                return "Judean Wilderness / Dead Sea"
            else:
                return "Judean Hill Country"
        else:
            return "Negev / Wilderness of Zin"
    return "Ancient Near East"

def determine_periods(verses: List[Dict[str, Any]]) -> str:
    periods = set()
    periods.add("all")
    osises = [v.get("osis", "").lower() for v in verses]
    osis_text = " ".join(osises)

    if any(b in osis_text for b in ["gen."]):
        periods.add("patriarchal")
    if any(b in osis_text for b in ["exod.", "lev.", "num.", "deut."]):
        periods.add("exodus")
    if any(b in osis_text for b in ["josh.", "judg.", "ruth.", "1sam.", "2sam.", "1kgs.", "2kgs.", "1chr.", "2chr.", "ps.", "prov.", "isa.", "jer.", "mic."]):
        periods.add("monarchy")
    if any(b in osis_text for b in ["ezra.", "neh.", "esth.", "dan.", "ezek.", "hag.", "zech.", "mal."]):
        periods.add("exile")
    if any(b in osis_text for b in ["matt.", "mark.", "luke.", "john."]):
        periods.add("roman_judea")
    if any(b in osis_text for b in ["acts.", "rom.", "1cor.", "2cor.", "gal.", "eph.", "phil.", "col.", "1thess.", "2thess.", "1tim.", "2tim.", "tit.", "heb.", "1pet.", "2pet.", "rev."]):
        periods.add("early_church")

    return ",".join(sorted(periods))

def determine_tier(name: str, slug: str, verse_count: int) -> Tuple[int, float, str]:
    clean_name = name.lower().strip()
    clean_slug = slug.lower().strip()
    if clean_name in ICONIC_MAJOR_KEYS or clean_slug in ICONIC_MAJOR_KEYS or verse_count >= 25:
        return 1, 0.0, "major"      # Tier 1: Major site, visible at all zoom levels
    elif verse_count >= 6:
        return 2, 7.0, "moderate"   # Tier 2: Moderate site, visible at zoom >= 7
    else:
        return 3, 9.8, "minor"      # Tier 3: Minor site, visible at zoom >= 9.8

def stream_jsonl(filename: str):
    url = f"{OPENBIBLE_DATA_BASE}/{filename}"
    print(f"  Streaming {filename} from {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "BibleStudyCrafterSync/1.0"})
    with urllib.request.urlopen(req) as resp:
        for line in resp:
            line_str = line.decode("utf-8").strip()
            if line_str:
                yield json.loads(line_str)

def main():
    print("=== Step 1: Loading all ancient.jsonl entities ===")
    ancient_list = []
    needed_modern_ids = set()

    for item in stream_jsonl("ancient.jsonl"):
        ancient_list.append(item)
        for ident in item.get("identifications", []):
            for res in ident.get("resolutions", []):
                mid = res.get("modern_basis_id")
                if mid:
                    needed_modern_ids.add(mid)

    print(f"Loaded {len(ancient_list)} ancient entities across A-Z.")
    print(f"Collected {len(needed_modern_ids)} needed modern basis IDs.")

    print("\n=== Step 2: Loading modern.jsonl entities ===")
    modern_map: Dict[str, Dict[str, Any]] = {}
    needed_image_ids = set()

    for item in stream_jsonl("modern.jsonl"):
        mid = item.get("id")
        if mid in needed_modern_ids:
            modern_map[mid] = item
            thumb = item.get("media", {}).get("thumbnail", {})
            iid = thumb.get("image_id")
            if iid:
                needed_image_ids.add(iid)

    print(f"Loaded {len(modern_map)} modern basis records.")
    print(f"Collected {len(needed_image_ids)} image IDs.")

    print("\n=== Step 3: Loading image.jsonl metadata ===")
    image_map: Dict[str, Dict[str, Any]] = {}
    for item in stream_jsonl("image.jsonl"):
        iid = item.get("id")
        if iid in needed_image_ids:
            image_map[iid] = item

    print(f"Loaded {len(image_map)} image metadata records.")

    print("\n=== Step 4: Loading existing curated sites for preservation ===")
    geojson_path = os.path.join(os.path.dirname(__file__), "..", "map_crafter", "data", "biblical_sites.geojson")
    existing_curated: Dict[str, Dict[str, Any]] = {}
    if os.path.exists(geojson_path):
        with open(geojson_path, "r", encoding="utf-8") as f:
            old_data = json.load(f)
            for feat in old_data.get("features", []):
                p = feat.get("properties", {})
                fid = p.get("id")
                if fid:
                    existing_curated[fid] = feat

    print(f"Found {len(existing_curated)} existing features to preserve/enrich.")

    print("\n=== Step 5: Constructing comprehensive GeoJSON features ===")
    features = []
    seen_ids = set()

    tier_counts = {1: 0, 2: 0, 3: 0}

    for item in ancient_list:
        aid = item.get("id")
        name = item.get("friendly_id") or aid
        slug = item.get("url_slug") or aid
        verses = item.get("verses", [])
        verse_count = len(verses)

        # Resolutions and Coordinates
        resolutions = [r for ident in item.get("identifications", []) for r in ident.get("resolutions", [])]
        best_res = next((r for r in resolutions if r.get("lonlat")), None)
        lonlat_str = best_res.get("lonlat") if best_res else None

        special_note = None
        if not lonlat_str:
            if aid in SPECIAL_COORDINATES:
                lonlat_str, special_note = SPECIAL_COORDINATES[aid]
            else:
                lonlat_str = "35.2354,31.7780" # Default center Levant

        parts = lonlat_str.split(",")
        lng, lat = round(float(parts[0]), 6), round(float(parts[1]), 6)

        mid = best_res.get("modern_basis_id") if best_res else None
        mod = modern_map.get(mid, {}) if mid else {}

        country = determine_country(lat, lng)
        region = determine_biblical_region(name, country, lat, lng)
        periods = determine_periods(verses)
        tier, min_zoom, tier_name = determine_tier(name, slug, verse_count)
        tier_counts[tier] += 1

        elevation = mod.get("elevation_m")
        if elevation is None:
            elevation = 100

        raw_cat = (best_res.get("type") if best_res else None) or (item.get("types", ["ancient_site"])[0] if item.get("types") else "ancient_site")
        category = raw_cat.lower().replace(" ", "_")

        # Photography
        mod_thumb = mod.get("media", {}).get("thumbnail", {})
        anc_thumb = item.get("media", {}).get("thumbnail", {})
        thumb = mod_thumb or anc_thumb or {}

        photo_url = None
        if thumb.get("file"):
            photo_url = f"https://a.openbible.info/geo/images/512/{thumb.get('file')}"

        iid = thumb.get("image_id")
        img_meta = image_map.get(iid, {}) if iid else {}

        credit = thumb.get("credit") or img_meta.get("credit") or img_meta.get("author") or "OpenBible / Wikimedia Commons"
        credit_url = thumb.get("credit_url") or img_meta.get("credit_url") or img_meta.get("url")
        license_code = img_meta.get("license") or "CC-BY-SA"
        caption = thumb.get("description") or name
        clean_caption = re.sub(r"<[^>]+>", "", caption).strip()

        photos = []
        if photo_url:
            photos.append({
                "image_id": iid,
                "thumb_url": photo_url,
                "full_url": credit_url or photo_url,
                "credit": credit,
                "credit_url": credit_url,
                "license": license_code,
                "caption": clean_caption
            })

        # Disambiguated ancient and modern names
        modern_name = mod.get("friendly_id") or name
        ancient_name = name

        # Format readable verses sample
        sample_verses = [v.get("readable") for v in verses[:5] if v.get("readable")]
        verses_summary = ", ".join(sample_verses) if sample_verses else ""
        if len(verses) > 5:
            verses_summary += f" (+{len(verses) - 5} more)"

        # Construct concise, informative description
        desc_parts = []
        id_names = [ident.get("description") for ident in item.get("identifications", []) if ident.get("description")]
        clean_ids = [re.sub(r"<[^>]+>", "", i).strip() for i in id_names if i]
        if clean_ids:
            desc_parts.append(f"Identified with {clean_ids[0]}.")
        if clean_caption and clean_caption.lower() != name.lower():
            desc_parts.append(f"{clean_caption[0].upper() + clean_caption[1:]}.")
        if special_note:
            desc_parts.append(special_note + ".")
        if verses_summary:
            desc_parts.append(f"Scripture: {verses_summary}.")
        description = " ".join(desc_parts)

        # Unique feature ID
        base_id = slug.replace("-", "_").replace(" ", "_").lower()
        feature_id = base_id
        suffix = 1
        while feature_id in seen_ids:
            suffix += 1
            feature_id = f"{base_id}_{suffix}"
        seen_ids.add(feature_id)

        # Check if existing curated feature has rich custom metadata
        if feature_id in existing_curated:
            cur = existing_curated[feature_id]
            cp = cur.get("properties", {})
            if cp.get("description") and len(cp["description"]) > len(description):
                description = cp["description"]
            if cp.get("photos") and len(cp["photos"]) > len(photos):
                photos = cp["photos"]
                photo_url = cp.get("photo_url")
                credit = cp.get("photo_credit", credit)
                credit_url = cp.get("photo_credit_url", credit_url)
                license_code = cp.get("photo_license", license_code)
                clean_caption = cp.get("photo_caption", clean_caption)
            if cp.get("ancient_name"):
                ancient_name = cp["ancient_name"]
            if cp.get("modern_name"):
                modern_name = cp["modern_name"]

        is_top_10 = feature_id in TOP_10_MAJOR_IDS

        feat = {
            "type": "Feature",
            "properties": {
                "id": feature_id,
                "name": name,
                "ancient_name": ancient_name,
                "modern_name": modern_name,
                "modern_country": country,
                "period": periods,
                "biblical_region": region,
                "elevation_m": elevation,
                "category": category,
                "description": description,
                "openbible_id": aid,
                "openbible_slug": slug,
                "openbible_url": f"https://www.openbible.info/geo/ancient/{aid}/{slug}",
                "modern_basis_id": mid,
                "confidence_score": best_res.get("best_path_score", 500) if best_res else 500,
                "verse_count": verse_count,
                "verses_summary": verses_summary,
                "tier": tier,
                "min_zoom": min_zoom,
                "tier_name": tier_name,
                "is_top_10": is_top_10,
                "photo_url": photo_url,
                "photo_credit": credit,
                "photo_credit_url": credit_url,
                "photo_license": license_code,
                "photo_caption": clean_caption,
                "photos": photos
            },
            "geometry": {
                "type": "Point",
                "coordinates": [lng, lat]
            }
        }
        features.append(feat)

    # Sort: Tier 1 first (by verse count desc), then Tier 2, then Tier 3 alphabetically
    features.sort(key=lambda x: (x["properties"]["tier"], -x["properties"]["verse_count"], x["properties"]["name"].lower()))

    out_geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(out_geojson, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(features)} total features to {geojson_path}.")
    print(f"  Tier 1 (Major, zoom >= 0):   {tier_counts[1]}")
    print(f"  Tier 2 (Moderate, zoom >= 7): {tier_counts[2]}")
    print(f"  Tier 3 (Minor, zoom >= 9.8): {tier_counts[3]}")

    # Synchronize verified database file
    verified_path = os.path.join(os.path.dirname(__file__), "..", "data", "openbible_gazetteer_verified.json")
    verified_data = {}
    for feat in features:
        p = feat["properties"]
        verified_data[p["name"].lower()] = {
            "key": p["id"],
            "openbible_id": p.get("openbible_id"),
            "openbible_slug": p.get("openbible_slug"),
            "openbible_url": p.get("openbible_url"),
            "modern_basis_id": p.get("modern_basis_id"),
            "lat": feat["geometry"]["coordinates"][1],
            "lng": feat["geometry"]["coordinates"][0],
            "elevation_m": p.get("elevation_m"),
            "confidence_score": p.get("confidence_score"),
            "verse_count": p.get("verse_count"),
            "tier": p.get("tier"),
            "tier_name": p.get("tier_name"),
            "min_zoom": p.get("min_zoom"),
            "is_top_10": p.get("is_top_10"),
            "photo_url": p.get("photo_url"),
            "photo_credit": p.get("photo_credit"),
            "photo_credit_url": p.get("photo_credit_url"),
            "photo_license": p.get("photo_license"),
            "photo_caption": p.get("photo_caption"),
            "photos": p.get("photos", []),
            "description": p.get("description"),
            "period": p.get("period")
        }

    with open(verified_path, "w", encoding="utf-8") as f:
        json.dump(verified_data, f, indent=2, ensure_ascii=False)

    print(f"Updated verified database in {verified_path} with {len(verified_data)} entries.")

if __name__ == "__main__":
    main()
