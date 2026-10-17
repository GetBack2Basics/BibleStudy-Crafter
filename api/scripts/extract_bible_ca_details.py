import re
import urllib.parse
import json

with open('scratch_bible_ca.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Let's find table rows
rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
base_url = "https://www.bible.ca/maps/"

items = []
for row in rows:
    links = re.findall(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', row, re.DOTALL | re.IGNORECASE)
    if not links:
        continue
    row_text = ' '.join(re.sub(r'<[^>]+>', ' ', row).split())
    for href, link_text in links:
        full_url = urllib.parse.urljoin(base_url, href)
        if any(ign in full_url.lower() for ign in ['seek.php', 'email-author', 'amazon.com', 'home.htm']):
            continue
        if any(x in full_url.lower() for x in ['.htm', '.jpg', '.png']):
            items.append({
                'row_text': row_text,
                'link_text': ' '.join(re.sub(r'<[^>]+>', ' ', link_text).split()),
                'url': full_url
            })

# Deduplicate by url
unique = {}
for it in items:
    url = it['url']
    if url not in unique or len(it['row_text']) > len(unique[url]['row_text']):
        unique[url] = it

print(f"Total unique maps/studies found: {len(unique)}")
for i, (url, data) in enumerate(list(unique.items())[:52]):
    print(f"{i+1}: {url}")
    print(f"   Link: '{data['link_text']}' | Row: '{data['row_text'][:90]}'")
