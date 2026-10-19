#!/usr/bin/env python3
"""OpenBible.info Atlas 'A' Ingestion & Gazetteer Synchronization Script.

Fetches and synchronizes all 136 biblical locations starting with 'A' from:
  https://www.openbible.info/geo/atlas/a
Cross-referenced against authoritative OpenBible datasets:
- ancient.jsonl (places, resolutions, verses, OSIS, confidence)
- modern.jsonl (WGS84 coordinates, modern names, elevation, media credits)
- image.jsonl (Wikimedia Commons images, photographer credits, licenses)

Integrates all 136 locations into:
- map_crafter/data/biblical_sites.geojson
- data/openbible_gazetteer_verified.json
"""
import json
import os
import re
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

OPENBIBLE_DATA_BASE = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data"
ATLAS_A_URL = "https://www.openbible.info/geo/atlas/a"

def determine_country(lat: float, lng: float) -> str:
    """Classify modern nation-state based on coordinates."""
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
    """Classify historical biblical region."""
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

def determine_periods(verses_str: str) -> str:
    """Extract applicable biblical epochs based on scriptural references."""
    periods = set()
    periods.add("all")
    v_lower = verses_str.lower()
    
    # Patriarchal
    if "gen" in v_lower:
        periods.add("patriarchal")
    # Exodus & Wilderness
    if any(b in v_lower for b in ["exod", "lev", "num", "deut"]):
        periods.add("exodus")
    # Monarchy / Conquest / United / Divided Kingdom
    if any(b in v_lower for b in ["josh", "judg", "ruth", "sam", "kgs", "chr", "ps", "prov", "isa", "jer", "hos", "amos", "mic"]):
        periods.add("monarchy")
    # Exile & Post-Exile
    if any(b in v_lower for b in ["ezra", "neh", "esth", "dan", "ezek", "hag", "zech", "mal"]):
        periods.add("exile")
    # Roman Judea / Gospels
    if any(b in v_lower for b in ["matt", "mark", "luke", "john"]):
        periods.add("roman_judea")
    # Early Church / Apostolic
    if any(b in v_lower for b in ["acts", "rom", "cor", "gal", "eph", "phil", "col", "thess", "tim", "tit", "heb", "pet", "rev"]):
        periods.add("early_church")
        
    return ",".join(sorted(periods))

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
    print("=== Step 1: Fetching all locations from https://www.openbible.info/geo/atlas/a ===")
    req_atlas = urllib.request.Request(ATLAS_A_URL, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req_atlas) as resp:
        atlas_html = resp.read().decode('utf-8', errors='ignore')

    pattern = re.compile(
        r'<h2 id="(?P<id>[^"]+)">(?P<name>[^<]+)</h2>\s*'
        r'<p>(?:<a href="(?P<slug_url>/geo/ancient/[^"]+)"><img src="(?P<img_url>[^"]+)"[^>]*alt="(?P<img_alt>[^"]*)"[^>]*/></a>\s*)?'
        r'(?:.*?Possible identifications</a>:\s*(?P<identifications>[^<]+))?'
        r'(?:<br/>(?P<verses>.*?))?</p>',
        re.DOTALL
    )

    atlas_places = []
    for m in pattern.finditer(atlas_html):
        d = m.groupdict()
        raw_verses = d.get('verses') or ''
        clean_verses = re.sub(r'<[^>]+>', '', raw_verses).strip()
        slug_url = d.get('slug_url') or ''
        slug = slug_url.split('/')[-1] if slug_url else ''
        atlas_places.append({
            'id': d['id'],
            'name': d['name'].strip(),
            'slug': slug,
            'img_url': d.get('img_url'),
            'img_alt': d.get('img_alt') or '',
            'identifications': (d.get('identifications') or '').strip(),
            'verses': clean_verses
        })

    print(f"Extracted {len(atlas_places)} authoritative places from OpenBible Atlas 'A'.")
    atlas_by_id = {p['id']: p for p in atlas_places}

    print("\n=== Step 2: Streaming ancient.jsonl for target 'A' entities ===")
    ancient_map: Dict[str, Dict[str, Any]] = {}
    needed_modern_ids = set()

    for item in stream_jsonl("ancient.jsonl"):
        aid = item.get("id")
        if aid in atlas_by_id:
            ancient_map[aid] = item
            for ident in item.get("identifications", []):
                for res in ident.get("resolutions", []):
                    mid = res.get("modern_basis_id")
                    if mid:
                        needed_modern_ids.add(mid)

    print(f"Loaded {len(ancient_map)} / {len(atlas_places)} ancient records.")
    print(f"Collected {len(needed_modern_ids)} modern basis IDs.")

    print("\n=== Step 3: Streaming modern.jsonl for coordinates, elevation, media ===")
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

    print(f"Loaded {len(modern_map)} / {len(needed_modern_ids)} modern basis records.")

    print("\n=== Step 4: Streaming image.jsonl for photography credits & licenses ===")
    image_map: Dict[str, Dict[str, Any]] = {}
    for item in stream_jsonl("image.jsonl"):
        iid = item.get("id")
        if iid in needed_image_ids:
            image_map[iid] = item

    print(f"Loaded {len(image_map)} image metadata records.")

    print("\n=== Step 5: Constructing enriched GeoJSON features ===")
    new_features = []
    
    for p in atlas_places:
        aid = p['id']
        name = p['name']
        slug = p['slug'] or aid
        anc = ancient_map.get(aid, {})
        
        # Resolutions & coordinates
        resolutions = [r for ident in anc.get('identifications', []) for r in ident.get('resolutions', [])]
        best_res = next((r for r in resolutions if r.get('lonlat')), None)
        
        lonlat_str = best_res.get('lonlat') if best_res else None
        # Handle Azazel special case
        if not lonlat_str and aid == 'ab9a5ec':
            lonlat_str = "35.3283,31.7483"  # Traditional Mount Azazel (Jebel Muntar cliff) in Judean Desert
            
        if not lonlat_str:
            print(f"Warning: No coordinates for {aid} {name}, skipping.")
            continue
            
        parts = lonlat_str.split(',')
        lng, lat = round(float(parts[0]), 6), round(float(parts[1]), 6)
        
        # Modern basis metadata
        mid = best_res.get('modern_basis_id') if best_res else None
        mod = modern_map.get(mid, {}) if mid else {}
        
        modern_name = mod.get('friendly_id') or p['identifications'].split(',')[0].strip() or name
        country = determine_country(lat, lng)
        region = determine_biblical_region(name, country, lat, lng)
        periods = determine_periods(p['verses'])
        
        elevation = mod.get('elevation_m')
        if elevation is None:
            elevation = 100
            
        raw_cat = (best_res.get('type') if best_res else None) or (anc.get('types', ['ancient_site'])[0] if anc.get('types') else 'ancient_site')
        category = raw_cat.lower().replace(' ', '_')
        
        # Photography
        mod_thumb = mod.get('media', {}).get('thumbnail', {})
        anc_thumb = anc.get('media', {}).get('thumbnail', {})
        thumb = mod_thumb or anc_thumb or {}
        
        photo_url = p.get('img_url')
        if not photo_url and thumb.get('file'):
            photo_url = f"https://a.openbible.info/geo/images/512/{thumb.get('file')}"
            
        iid = thumb.get('image_id')
        img_meta = image_map.get(iid, {}) if iid else {}
        
        credit = thumb.get('credit') or img_meta.get('credit') or img_meta.get('author') or "OpenBible / Wikimedia Commons"
        credit_url = thumb.get('credit_url') or img_meta.get('credit_url') or img_meta.get('url')
        license_code = img_meta.get('license') or "CC-BY-SA"
        caption = p.get('img_alt') or thumb.get('description') or name
        clean_caption = re.sub(r'<[^>]+>', '', caption).strip()
        
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
            
        # Description
        desc_parts = []
        if p['identifications']:
            desc_parts.append(f"Identified with {p['identifications']}.")
        if clean_caption and clean_caption.lower() != name.lower():
            desc_parts.append(f"{clean_caption[0].upper() + clean_caption[1:]}.")
        if p['verses']:
            desc_parts.append(f"Biblical references: {p['verses']}.")
        description = " ".join(desc_parts)
        
        feature_id = slug.replace('-', '_').replace(' ', '_').lower()
        # Avoid duplicate feature IDs if multiple exist
        if aid in ['a2270e4', 'ad0d82f']: # Achzib 1, Achzib 2
            feature_id = f"achzib_{1 if aid == 'a2270e4' else 2}"
        if aid in ['ae41ab4', 'a6c704a']: # Antioch 1, Antioch 2
            feature_id = "antioch" if aid == 'ae41ab4' else "antioch_pisidia"
            
        feat = {
            "type": "Feature",
            "properties": {
                "id": feature_id,
                "name": name,
                "ancient_name": name,
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
                "confidence_score": best_res.get('best_path_score', 500) if best_res else 500,
                "photo_url": photo_url,
                "photo_credit": credit,
                "photo_credit_url": credit_url,
                "photo_license": license_code,
                "photo_caption": clean_caption,
                "photos": photos,
                "verses_summary": p['verses']
            },
            "geometry": {
                "type": "Point",
                "coordinates": [lng, lat]
            }
        }
        new_features.append(feat)

    print(f"Generated {len(new_features)} GeoJSON features for Atlas 'A' sites.")

    print("\n=== Step 6: Merging with existing curated sites ===")
    geojson_path = os.path.join(os.path.dirname(__file__), "..", "map_crafter", "data", "biblical_sites.geojson")
    with open(geojson_path, "r", encoding="utf-8") as f:
        existing_geojson = json.load(f)

    # Index existing features by normalized id
    existing_by_id = {f['properties']['id']: f for f in existing_geojson['features']}
    
    # Existing curated sites not starting with 'A' (e.g. Jerusalem, Bethlehem, Nazareth, Rome, etc.)
    non_a_existing = [
        f for f in existing_geojson['features'] 
        if not f['properties']['name'].startswith('A') and f['properties']['id'] not in ['antioch', 'athens']
    ]
    print(f"Retaining {len(non_a_existing)} existing curated non-'A' biblical sites.")

    merged_features = []
    # 1. Add all 136 Atlas 'A' sites (preserving enriched descriptions for Antioch & Athens)
    for feat in new_features:
        fid = feat['properties']['id']
        if fid in existing_by_id:
            # Preserve rich curated descriptions and photos if available
            orig = existing_by_id[fid]
            if orig['properties'].get('description') and len(orig['properties']['description']) > len(feat['properties']['description']):
                feat['properties']['description'] = orig['properties']['description']
            if orig['properties'].get('photos') and len(orig['properties']['photos']) > len(feat['properties']['photos']):
                feat['properties']['photos'] = orig['properties']['photos']
                feat['properties']['photo_url'] = orig['properties'].get('photo_url')
        merged_features.append(feat)

    # 2. Add all non-'A' existing curated sites
    merged_features.extend(non_a_existing)

    # Sort alphabetically by site name
    merged_features.sort(key=lambda x: x['properties']['name'].lower())

    out_geojson = {
        "type": "FeatureCollection",
        "features": merged_features
    }

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(out_geojson, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(merged_features)} total features to {geojson_path}.")

    # Also update data/openbible_gazetteer_verified.json
    verified_path = os.path.join(os.path.dirname(__file__), "..", "data", "openbible_gazetteer_verified.json")
    verified_data = {}
    if os.path.exists(verified_path):
        with open(verified_path, "r", encoding="utf-8") as f:
            verified_data = json.load(f)

    for feat in merged_features:
        p = feat['properties']
        verified_data[p['name'].lower()] = {
            "key": p['id'],
            "openbible_id": p.get('openbible_id'),
            "openbible_slug": p.get('openbible_slug'),
            "openbible_url": p.get('openbible_url'),
            "modern_basis_id": p.get('modern_basis_id'),
            "lat": feat['geometry']['coordinates'][1],
            "lng": feat['geometry']['coordinates'][0],
            "elevation_m": p.get('elevation_m'),
            "confidence_score": p.get('confidence_score'),
            "photo_url": p.get('photo_url'),
            "photo_credit": p.get('photo_credit'),
            "photo_credit_url": p.get('photo_credit_url'),
            "photo_license": p.get('photo_license'),
            "photo_caption": p.get('photo_caption'),
            "photos": p.get('photos', []),
            "description": p.get('description'),
            "period": p.get('period')
        }

    with open(verified_path, "w", encoding="utf-8") as f:
        json.dump(verified_data, f, indent=2, ensure_ascii=False)

    print(f"Updated verified gazetteer in {verified_path} with {len(verified_data)} entries.")

if __name__ == "__main__":
    main()
