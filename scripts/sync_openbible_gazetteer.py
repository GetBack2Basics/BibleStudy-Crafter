#!/usr/bin/env python3
"""OpenBible.info Gazetteer Synchronization & Verification Script.

Downloads and cross-references OpenBible.info authoritative datasets:
- ancient.jsonl (places, verses, disambiguation)
- modern.jsonl (WGS84 coordinates, modern names, media thumbnails)
- image.jsonl (Wikimedia Commons images, photographer credits, licenses)

Calibrates BibleStudy-Crafter's BIBLICAL_GAZETTEER and map_crafter/data/biblical_sites.geojson.
"""
import json
import os
import re
import urllib.request
from typing import Any, Dict, List, Optional

OPENBIBLE_BASE = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data"

# Site keys to match in OpenBible.info
TARGET_KEYS = [
    "jerusalem", "bethlehem", "nazareth", "capernaum", "sea of galilee",
    "jericho", "jordan river", "dead sea", "bethany", "caesarea philippi",
    "caesarea maritima", "hebron", "shechem", "antioch", "damascus",
    "ephesus", "athens", "corinth", "rome", "mount sinai",
    "mount carmel", "babylon", "ur of the chaldees", "nineveh", "joppa",
    "emmaus"
]

# Precise slug mapping to OpenBible authoritative entities
NAME_ALIASES = {
    "antioch": "antioch-1",            # Antioch on the Orontes (Syria)
    "babylon": "babylon-1",            # Capital of Babylonia
    "bethany": "bethany-1",            # Bethany near Jerusalem
    "bethlehem": "bethlehem-1",        # Bethlehem of Judea
    "caesarea maritima": "caesarea",   # Caesarea on the Sharon coast
    "caesarea philippi": "caesarea-philippi",
    "dead sea": "salt-sea",            # Biblical Salt Sea
    "jericho": "jericho-1",            # City of Jericho
    "jordan river": "jordan",          # Jordan River
    "mount carmel": "mount-carmel",
    "mount sinai": "mount-sinai",
    "nineveh": "nineveh",
    "sea of galilee": "sea-of-galilee",
    "ur of the chaldees": "ur-1",       # Ur of the Chaldees in Sumer
    "joppa": "joppa",
    "shechem": "shechem",
    "emmaus": "emmaus",
}

def stream_jsonl(filename: str):
    url = f"{OPENBIBLE_BASE}/{filename}"
    print(f"Streaming {filename} from {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "BibleStudyCrafterSync/1.0"})
    with urllib.request.urlopen(req) as resp:
        for line in resp:
            line_str = line.decode("utf-8").strip()
            if line_str:
                yield json.loads(line_str)

def main():
    print("=== Step 1: Scanning ancient.jsonl for target biblical sites ===")
    ancient_map: Dict[str, Dict[str, Any]] = {}
    modern_ids_needed = set()

    for item in stream_jsonl("ancient.jsonl"):
        friendly = (item.get("friendly_id") or "").lower().strip()
        slug = (item.get("url_slug") or "").lower().strip()
        
        # Check against target keys and aliases
        matched_key = None
        for k in TARGET_KEYS:
            target_slug = NAME_ALIASES.get(k, k).lower()
            if slug == target_slug or friendly == target_slug or slug == k or friendly == k:
                matched_key = k
                break
        
        if matched_key and matched_key not in ancient_map:
            # Pick first resolution
            resolutions = []
            for ident in item.get("identifications", []):
                for res in ident.get("resolutions", []):
                    resolutions.append(res)
            
            top_res = resolutions[0] if resolutions else {}
            modern_basis_id = top_res.get("modern_basis_id")
            if modern_basis_id:
                modern_ids_needed.add(modern_basis_id)
            
            lonlat_str = top_res.get("lonlat")
            lon, lat = (None, None)
            if lonlat_str and "," in lonlat_str:
                parts = lonlat_str.split(",")
                lon, lat = float(parts[0]), float(parts[1])

            ancient_map[matched_key] = {
                "openbible_id": item.get("id"),
                "openbible_slug": item.get("url_slug") or matched_key,
                "openbible_url": f"https://www.openbible.info/geo/ancient/{item.get('id')}/{item.get('url_slug') or matched_key}",
                "modern_basis_id": modern_basis_id,
                "confidence_score": top_res.get("best_path_score") or 500,
                "lat": lat,
                "lng": lon,
                "verse_count": len(item.get("verses", [])),
                "sample_verses": [v.get("readable") for v in item.get("verses", [])[:5]],
            }

    print(f"Matched {len(ancient_map)} / {len(TARGET_KEYS)} ancient sites.")

    print("\n=== Step 2: Scanning modern.jsonl for coordinates, elevation, media ===")
    image_ids_needed = set()
    modern_map: Dict[str, Dict[str, Any]] = {}

    for item in stream_jsonl("modern.jsonl"):
        mid = item.get("id")
        if mid in modern_ids_needed:
            thumbnail = item.get("media", {}).get("thumbnail", {})
            img_id = thumbnail.get("image_id")
            if img_id:
                image_ids_needed.add(img_id)
            
            lonlat_str = item.get("lonlat")
            lon, lat = (None, None)
            if lonlat_str and "," in lonlat_str:
                parts = lonlat_str.split(",")
                lon, lat = float(parts[0]), float(parts[1])

            modern_map[mid] = {
                "modern_name": item.get("friendly_id"),
                "lat": lat,
                "lng": lon,
                "elevation_m": item.get("elevation_m"),
                "thumbnail_file": thumbnail.get("file"),
                "thumbnail_credit": thumbnail.get("credit"),
                "thumbnail_credit_url": thumbnail.get("credit_url"),
                "thumbnail_desc": thumbnail.get("description"),
                "image_id": img_id,
            }

    print(f"Found modern records for {len(modern_map)} / {len(modern_ids_needed)} sites.")

    print("\n=== Step 3: Scanning image.jsonl for all site photos & high-res metadata ===")
    site_photos: Dict[str, List[Dict[str, Any]]] = {k: [] for k in TARGET_KEYS}
    
    # Map modern_ids back to site keys
    mid_to_site = {}
    for k in TARGET_KEYS:
        anc = ancient_map.get(k, {})
        mid = anc.get("modern_basis_id")
        if mid:
            mid_to_site[mid] = k

    # Pre-add thumbnail from modern_map if available
    for k in TARGET_KEYS:
        anc = ancient_map.get(k, {})
        mid = anc.get("modern_basis_id")
        mod = modern_map.get(mid, {}) if mid else {}
        thumb_file = mod.get("thumbnail_file")
        if thumb_file:
            clean_d = re.sub(r"<[^>]+>", "", mod.get("thumbnail_desc") or "").strip()
            site_photos[k].append({
                "image_id": mod.get("image_id"),
                "thumb_url": f"https://a.openbible.info/geo/images/512/{thumb_file}",
                "full_url": mod.get("thumbnail_credit_url"),
                "credit": mod.get("thumbnail_credit") or "OpenBible / Wikimedia Commons",
                "credit_url": mod.get("thumbnail_credit_url"),
                "license": "CC-BY-SA",
                "caption": clean_d or k.title(),
            })

    for item in stream_jsonl("image.jsonl"):
        iid = item.get("id")
        desc_dict = item.get("descriptions", {})
        thumb_dict = item.get("thumbnails", {})
        credit = item.get("credit") or item.get("author") or "OpenBible / Wikimedia Commons"
        credit_url = item.get("credit_url") or item.get("url")
        full_url = item.get("file_url")
        license_code = item.get("license") or "CC-BY-SA"

        # 1. Match by modern basis ID
        for mid, target_site in mid_to_site.items():
            if mid in desc_dict or mid in thumb_dict:
                desc = re.sub(r"<[^>]+>", "", desc_dict.get(mid, "")).strip()
                tinfo = thumb_dict.get(mid, {})
                tfile = tinfo.get("file") if isinstance(tinfo, dict) else None
                if not tfile and thumb_dict:
                    any_thumb = next(iter(thumb_dict.values()))
                    if isinstance(any_thumb, dict):
                        tfile = any_thumb.get("file")
                
                thumb_512 = f"https://a.openbible.info/geo/images/512/{tfile}" if tfile else full_url

                # If primary thumbnail was already added, enrich its full_url and license
                existing = next((p for p in site_photos[target_site] if p.get("image_id") == iid), None)
                if existing:
                    if full_url:
                        existing["full_url"] = full_url
                    if license_code:
                        existing["license"] = license_code
                    if credit:
                        existing["credit"] = credit
                    if credit_url:
                        existing["credit_url"] = credit_url
                else:
                    site_photos[target_site].append({
                        "image_id": iid,
                        "thumb_url": thumb_512,
                        "full_url": full_url,
                        "credit": credit,
                        "credit_url": credit_url,
                        "license": license_code,
                        "caption": desc or target_site.title(),
                    })

        # 2. Text / name matching if site has < 4 photos
        desc_all = " ".join(desc_dict.values()).lower()
        file_url_str = (full_url or "").lower()
        for s_key in TARGET_KEYS:
            if len(site_photos[s_key]) < 4:
                names = [s_key, NAME_ALIASES.get(s_key, s_key)]
                matched = False
                for n in names:
                    if len(n) >= 4 and (f" {n} " in f" {desc_all} " or f"_{n}_" in file_url_str or f"/{n}_" in file_url_str or f"-{n}-" in file_url_str):
                        matched = True
                        break
                if matched and not any(p.get("image_id") == iid for p in site_photos[s_key]):
                    any_mid = next(iter(desc_dict.keys()), None)
                    desc = re.sub(r"<[^>]+>", "", desc_dict.get(any_mid, "")).strip() if any_mid else ""
                    any_tinfo = next(iter(thumb_dict.values()), {}) if thumb_dict else {}
                    tfile = any_tinfo.get("file") if isinstance(any_tinfo, dict) else None
                    thumb_512 = f"https://a.openbible.info/geo/images/512/{tfile}" if tfile else full_url

                    site_photos[s_key].append({
                        "image_id": iid,
                        "thumb_url": thumb_512,
                        "full_url": full_url,
                        "credit": credit,
                        "credit_url": credit_url,
                        "license": license_code,
                        "caption": desc or s_key.title(),
                    })

    # Combine into comprehensive verified dictionary
    verified_results = {}
    for key in TARGET_KEYS:
        anc = ancient_map.get(key, {})
        mid = anc.get("modern_basis_id")
        mod = modern_map.get(mid, {}) if mid else {}
        photos = site_photos.get(key, [])
        primary_photo = photos[0] if photos else {}

        verified_results[key] = {
            "key": key,
            "openbible_id": anc.get("openbible_id"),
            "openbible_slug": anc.get("openbible_slug"),
            "openbible_url": anc.get("openbible_url"),
            "modern_basis_id": mid,
            "lat": anc.get("lat") or mod.get("lat"),
            "lng": anc.get("lng") or mod.get("lng"),
            "elevation_m": mod.get("elevation_m"),
            "confidence_score": anc.get("confidence_score"),
            "verse_count": anc.get("verse_count"),
            "sample_verses": anc.get("sample_verses", []),
            "photo_url": primary_photo.get("thumb_url"),
            "photo_credit": primary_photo.get("credit"),
            "photo_credit_url": primary_photo.get("credit_url"),
            "photo_license": primary_photo.get("license"),
            "photo_caption": primary_photo.get("caption"),
            "photos": photos,
        }

    # Save to data directory
    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "openbible_gazetteer_verified.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(verified_results, f, indent=2)
    print(f"\nSaved verified gazetteer to {out_path} ({len(verified_results)} entries)")

    for k in TARGET_KEYS:
        entry = verified_results.get(k, {})
        status = "OK" if entry.get("openbible_id") and entry.get("lat") else "MISSING"
        photo_st = "PHOTO" if entry.get("photo_url") else "NO-PHOTO"
        credit = (entry.get('photo_credit') or 'None').encode('ascii', 'replace').decode('ascii')
        print(f"[{status}] [{photo_st}] {k:<18} -> {entry.get('openbible_id')} | {entry.get('lat')}, {entry.get('lng')} | {credit}")

if __name__ == "__main__":
    main()
