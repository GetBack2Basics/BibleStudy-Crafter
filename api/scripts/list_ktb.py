import re
import urllib.parse
import json

def get_ktb_maps():
    with open('scratch_knowingthebible.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    matches = re.findall(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, re.DOTALL | re.IGNORECASE)
    items = []
    base_url = "https://www.knowingthebible.net"
    for href, inner in matches:
        title = re.sub(r'<[^>]+>', ' ', inner).strip()
        title = ' '.join(title.split())
        if not title or title.lower() in ['home', 'privacy policy', 'terms of service', 'contact us', 'about', 'site map']:
            continue
        full_url = urllib.parse.urljoin(base_url, href)
        if 'send/6-maps' in full_url:
            clean_title = re.sub(r'^\d+\s+', '', title)
            items.append({
                "title": clean_title,
                "url": full_url,
            })
    
    seen = set()
    dedup = []
    for it in items:
        if it["url"] not in seen:
            seen.add(it["url"])
            dedup.append(it)
    return dedup

if __name__ == '__main__':
    ktb = get_ktb_maps()
    print(f"Total: {len(ktb)}")
    for i, it in enumerate(ktb):
        print(f"{i+1}: {it['title']} -> {it['url']}")
