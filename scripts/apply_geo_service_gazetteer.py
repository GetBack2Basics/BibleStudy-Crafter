import json
import os
import re

verified_path = r'c:\Projects\BibleStudy-Crafter\data\openbible_gazetteer_verified.json'
with open(verified_path, encoding='utf-8') as f:
    verified = json.load(f)

geo_service_path = r'c:\Projects\BibleStudy-Crafter\api\app\services\geo_service.py'
with open(geo_service_path, encoding='utf-8') as f:
    code = f.read()

# We want to update BIBLICAL_GAZETTEER in geo_service.py
# Let's inspect the existing gazetteer in geo_service.py
import sys
sys.path.insert(0, os.path.abspath('api'))
from app.services.geo_service import BIBLICAL_GAZETTEER

new_gazetteer = {}
for k, entry in BIBLICAL_GAZETTEER.items():
    new_entry = dict(entry)
    v = verified.get(k)
    if v:
        if v.get('lat') is not None and v.get('lng') is not None:
            new_entry['lat'] = round(v['lat'], 4)
            new_entry['lng'] = round(v['lng'], 4)
        if v.get('elevation_m') is not None:
            new_entry['elevation_m'] = v['elevation_m']
        new_entry['openbible_id'] = v.get('openbible_id')
        new_entry['openbible_slug'] = v.get('openbible_slug')
        new_entry['openbible_url'] = v.get('openbible_url')
        new_entry['modern_basis_id'] = v.get('modern_basis_id')
        new_entry['confidence_score'] = v.get('confidence_score')
        new_entry['photo_url'] = v.get('photo_url')
        new_entry['photo_credit'] = v.get('photo_credit')
        new_entry['photo_credit_url'] = v.get('photo_credit_url')
        new_entry['photo_license'] = v.get('photo_license')
        new_entry['photo_caption'] = v.get('photo_caption')
        new_entry['photos'] = v.get('photos', [])
    new_gazetteer[k] = new_entry

# Format as python dict
lines = ["BIBLICAL_GAZETTEER: Dict[str, Dict[str, Any]] = {"]
for k, data in new_gazetteer.items():
    lines.append(f'    "{k}": {{')
    for field, val in data.items():
        if isinstance(val, str):
            # Escape quotes properly
            clean_str = val.replace('\\', '\\\\').replace('"', '\\"')
            lines.append(f'        "{field}": "{clean_str}",')
        elif val is None:
            lines.append(f'        "{field}": None,')
        else:
            lines.append(f'        "{field}": {val},')
    lines.append("    },")
lines.append("}")

formatted_dict = "\n".join(lines)

# Replace between BIBLICAL_GAZETTEER: Dict[str, Dict[str, Any]] = { ... }
pattern = r"BIBLICAL_GAZETTEER:\s*Dict\[str,\s*Dict\[str,\s*Any\]\]\s*=\s*\{.*?\n\}"
match = re.search(pattern, code, re.DOTALL)
if match:
    new_code = code[:match.start()] + formatted_dict + code[match.end():]
    with open(geo_service_path, "w", encoding="utf-8") as f:
        f.write(new_code)
    print("Successfully updated BIBLICAL_GAZETTEER in geo_service.py!")
else:
    print("Could not match BIBLICAL_GAZETTEER in geo_service.py")
