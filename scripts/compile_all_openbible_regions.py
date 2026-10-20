#!/usr/bin/env python3
"""Compile biblical historical regions, kingdoms, and territories from OpenBible.info geometry dataset.

Outputs:
- map_crafter/data/biblical_regions.geojson
"""
import json
import os
import urllib.request

BASE_URL = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main"

FAMOUS_REGIONS = [
    "Ammon", "Moab 1", "Edom", "Philistia", "Phoenicia", "Aram", "Gilead 1", "Bashan",
    "Assyria", "Babylonia", "Persia", "Media", "Achaia", "Macedonia", "Cyprus", "Crete",
    "Arabah", "Decapolis", "Amalek", "Midian", "Canaan", "Abilene", "Galatia", "Bithynia",
    "Cappadocia", "Cilicia", "Asia", "Lydia", "Mysia", "Phrygia", "Pamphylia", "Pisidia",
    "Pontus", "Lycaonia", "Trachonitis", "Goshen 1"
]

PALETTE = [
    "#b8860b", "#cd853f", "#d2691e", "#8b4513", "#a0522d", "#bc8f8f", "#c07d53", "#996515",
    "#8fbc8f", "#556b2f", "#6b8e23", "#483d8b", "#4682b4", "#5f9ea0", "#708090", "#778899"
]

def main():
    print("=== Step 1: Loading geometry.jsonl ===")
    req = urllib.request.Request(f"{BASE_URL}/data/geometry.jsonl", headers={"User-Agent": "BibleStudyCrafterSync/1.0"})
    geoms = []
    with urllib.request.urlopen(req) as resp:
        for line in resp:
            line_str = line.decode("utf-8").strip()
            if not line_str:
                continue
            geoms.append(json.loads(line_str))

    print(f"Loaded {len(geoms)} total geometry records.")

    print("\n=== Step 2: Downloading and compiling regional vector features ===")
    compiled_features = []
    seen_names = set()
    idx = 0

    for g in geoms:
        raw_name = g.get("name", "")
        if raw_name in FAMOUS_REGIONS:
            clean_name = raw_name.replace(" 1", "").replace(" 2", "")
            if clean_name in seen_names:
                continue
            seen_names.add(clean_name)

            filename = g.get("geojson_file") or g.get("isobands_geojson_file")
            if not filename:
                continue

            url = f"{BASE_URL}/geometry/{filename}"
            try:
                r = urllib.request.Request(url, headers={"User-Agent": "BibleStudyCrafterSync/1.0"})
                with urllib.request.urlopen(r) as resp:
                    feat = json.load(resp)
                    color = PALETTE[idx % len(PALETTE)]
                    idx += 1

                    # Ensure standard Feature format
                    feat_props = feat.get("properties", {})
                    feat_props["id"] = g.get("id")
                    feat_props["name"] = clean_name
                    feat_props["raw_name"] = raw_name
                    feat_props["category"] = "biblical_region"
                    feat_props["geometry_type"] = g.get("geometry")
                    feat_props["fill_color"] = color
                    feat_props["stroke_color"] = color
                    feat["properties"] = feat_props

                    compiled_features.append(feat)
                    print(f"  Compiled: {clean_name} ({feat.get('geometry', {}).get('type')})")
            except Exception as e:
                print(f"  Error fetching {clean_name}: {e}")

    out_geojson = {
        "type": "FeatureCollection",
        "features": compiled_features
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "map_crafter", "data", "biblical_regions.geojson")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out_geojson, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(compiled_features)} compiled biblical regions to {out_path}.")

if __name__ == "__main__":
    main()
