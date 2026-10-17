import os
import urllib.request

BOOKS = [
    "gen", "exod", "lev", "num", "deut", "josh", "judg", "ruth",
    "1sam", "2sam", "1kgs", "2kgs", "1chr", "2chr", "ezra", "neh",
    "esth", "job", "ps", "prov", "eccl", "song", "isa", "jer",
    "lam", "ezek", "dan", "hos", "joel", "amos", "obad", "jonah",
    "mic", "nah", "hab", "zeph", "hag", "zech", "mal",
    "matt", "mark", "luke", "john", "acts", "rom", "1cor", "2cor",
    "gal", "eph", "phil", "col", "1thess", "2thess", "1tim", "2tim",
    "titus", "phlm", "heb", "jas", "1pet", "2pet", "1john", "2john",
    "3john", "jude", "rev"
]

out_dir = r"c:\Projects\BibleStudy-Crafter\map_crafter\data\kml"
os.makedirs(out_dir, exist_ok=True)

print(f"Downloading authoritative OpenBible KMLs to {out_dir}...")
count = 0
for b in BOOKS:
    dest = os.path.join(out_dir, f"{b}.kml")
    if os.path.exists(dest) and os.path.getsize(dest) > 100:
        continue
    url = f"https://a.openbible.info/geo/kmls/{b}.kml"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "BibleStudyCrafter/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read()
            with open(dest, "wb") as f:
                f.write(content)
            count += 1
            print(f"Downloaded {b}.kml ({len(content)} bytes)")
    except Exception as e:
        print(f"Error {b}: {e}")

print(f"Finished. Downloaded {count} new KML files.")
