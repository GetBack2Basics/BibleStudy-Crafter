import json
import os

verified_path = r'c:\Projects\BibleStudy-Crafter\data\openbible_gazetteer_verified.json'
with open(verified_path, encoding='utf-8') as f:
    verified = json.load(f)

# 1. Update map_crafter/data/biblical_sites.geojson
geojson_path = r'c:\Projects\BibleStudy-Crafter\map_crafter\data\biblical_sites.geojson'
with open(geojson_path, encoding='utf-8') as f:
    geojson = json.load(f)

existing_keys = set()
for feat in geojson['features']:
    props = feat['properties']
    raw_id = props.get('id', '')
    key = raw_id.replace('_', ' ')
    if key in verified:
        existing_keys.add(key)
        v = verified[key]
        if v.get('lat') is not None and v.get('lng') is not None:
            feat['geometry']['coordinates'] = [round(v['lng'], 6), round(v['lat'], 6)]
        props['openbible_id'] = v.get('openbible_id')
        props['openbible_slug'] = v.get('openbible_slug')
        props['openbible_url'] = v.get('openbible_url')
        props['modern_basis_id'] = v.get('modern_basis_id')
        props['confidence_score'] = v.get('confidence_score')
        props['photo_url'] = v.get('photo_url')
        props['photo_credit'] = v.get('photo_credit')
        props['photo_credit_url'] = v.get('photo_credit_url')
        props['photo_license'] = v.get('photo_license')
        props['photo_caption'] = v.get('photo_caption')
        props['photos'] = v.get('photos', [])
        if v.get('elevation_m') is not None:
            props['elevation_m'] = v.get('elevation_m')

# Add missing 5 sites (babylon, ur of the chaldees, nineveh, joppa, emmaus)
additional_meta = {
    "babylon": {
        "name": "Babylon",
        "ancient_name": "Babylon (Babil)",
        "modern_name": "Hillah / Babylon Archaeological Site",
        "modern_country": "Iraq",
        "period": "exile",
        "biblical_region": "Mesopotamia / Shinar",
        "category": "ancient_city",
        "description": "Capital of the Neo-Babylonian Empire; destination of Judah's exile under Nebuchadnezzar; home of Daniel."
    },
    "ur of the chaldees": {
        "name": "Ur of the Chaldees",
        "ancient_name": "Ur (Tell el-Muqayyar)",
        "modern_name": "Nasiriyah / Tell al-Muqayyar",
        "modern_country": "Iraq",
        "period": "patriarchal",
        "biblical_region": "Sumer / Lower Mesopotamia",
        "category": "ancient_city",
        "description": "Ancestral homeland of Abraham from which God called him to travel to the Promised Land."
    },
    "nineveh": {
        "name": "Nineveh",
        "ancient_name": "Nineveh (Ninua)",
        "modern_name": "Mosul / Kouyunjik",
        "modern_country": "Iraq",
        "period": "monarchy",
        "biblical_region": "Upper Tigris / Assyria",
        "category": "capital",
        "description": "Great capital of the Assyrian Empire to which the prophet Jonah was sent to preach repentance."
    },
    "joppa": {
        "name": "Joppa",
        "ancient_name": "Joppa (Yafo / Japho)",
        "modern_name": "Jaffa (Tel Aviv-Yafo)",
        "modern_country": "Israel",
        "period": "monarchy,early_church",
        "biblical_region": "Mediterranean Coast",
        "category": "port",
        "description": "Port where Jonah fled to Tarshish; Peter had his vision of clean/unclean animals at Simon the Tanner's house."
    },
    "emmaus": {
        "name": "Emmaus",
        "ancient_name": "Emmaus (Nicopolis / Motza / El-Qubeibeh)",
        "modern_name": "Emmaus Nicopolis (Latrun)",
        "modern_country": "Israel",
        "period": "roman_judea",
        "biblical_region": "Judean Foothills (Shephelah)",
        "category": "village",
        "description": "Seven miles from Jerusalem where the risen Jesus walked with two disciples and broke bread."
    }
}

for key, meta in additional_meta.items():
    if key in verified and key not in existing_keys:
        v = verified[key]
        new_feat = {
            "type": "Feature",
            "properties": {
                "id": key.replace(" ", "_"),
                "name": meta["name"],
                "ancient_name": meta["ancient_name"],
                "modern_name": meta["modern_name"],
                "modern_country": meta["modern_country"],
                "period": meta["period"],
                "biblical_region": meta["biblical_region"],
                "elevation_m": v.get("elevation_m", 100),
                "category": meta["category"],
                "description": meta["description"],
                "openbible_id": v.get("openbible_id"),
                "openbible_slug": v.get("openbible_slug"),
                "openbible_url": v.get("openbible_url"),
                "modern_basis_id": v.get("modern_basis_id"),
                "confidence_score": v.get("confidence_score"),
                "photo_url": v.get("photo_url"),
                "photo_credit": v.get("photo_credit"),
                "photo_credit_url": v.get("photo_credit_url"),
                "photo_license": v.get("photo_license"),
                "photo_caption": v.get("photo_caption"),
                "photos": v.get("photos", []),
            },
            "geometry": {
                "type": "Point",
                "coordinates": [round(v['lng'], 6), round(v['lat'], 6)]
            }
        }
        geojson["features"].append(new_feat)

with open(geojson_path, "w", encoding="utf-8") as f:
    json.dump(geojson, f, indent=2, ensure_ascii=False)

print(f"Updated {geojson_path} with {len(geojson['features'])} verified features.")
