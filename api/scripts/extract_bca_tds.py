import re
import urllib.parse
import json

with open('scratch_bible_ca.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Let's find all td contents with links
tds = re.findall(r'<td[^>]*>(.*?)</td>', html, re.DOTALL | re.IGNORECASE)
print(f'Total td elements: {len(tds)}')

maps_found = []
base_url = "https://www.bible.ca/maps/"

for td in tds:
    # check for links
    links = re.findall(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', td, re.DOTALL | re.IGNORECASE)
    if not links:
        continue
    clean_td = re.sub(r'<[^>]+>', ' ', td).strip()
    clean_td = ' '.join(clean_td.split())
    for href, link_text in links:
        full_url = urllib.parse.urljoin(base_url, href)
        if any(x in full_url.lower() for x in ['maps', 'archeology', 'chronology', 'ark']):
            if not any(x in full_url.lower() for x in ['seek.php', 'email-author', 'amazon.com']):
                maps_found.append({
                    "text": clean_td[:120],
                    "link_text": link_text.strip(),
                    "url": full_url
                })

print(f'Found {len(maps_found)} candidate maps in tds')
# Show distinct URLs
seen = set()
unique_maps = []
for m in maps_found:
    if m["url"] not in seen:
        seen.add(m["url"])
        unique_maps.append(m)

print(f'Unique map URLs: {len(unique_maps)}')
for i, m in enumerate(unique_maps):
    print(f"{i+1}. [{m['text'][:55]}] -> {m['url']}")

