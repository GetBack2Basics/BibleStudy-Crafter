import re
import urllib.parse
import json

def parse_knowingthebible():
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
            # Clean title e.g. "01 The Near East" -> "The Near East"
            clean_title = re.sub(r'^\d+\s+', '', title)
            items.append({
                "title": title,
                "clean_title": clean_title,
                "url": full_url,
                "source": "knowingthebible"
            })
    
    seen = set()
    dedup = []
    for it in items:
        if it["url"] not in seen:
            seen.add(it["url"])
            dedup.append(it)
    return dedup

def parse_bible_ca():
    with open('scratch_bible_ca.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    # In bible.ca, tables contain rows with series of titles and outline/map links.
    # Let's inspect <tr> tags or links in tables.
    tr_matches = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
    items = []
    base_url = "https://www.bible.ca/maps/"
    
    for tr in tr_matches:
        tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.DOTALL | re.IGNORECASE)
        if not tds:
            continue
        tr_text = re.sub(r'<[^>]+>', ' ', tr).strip()
        tr_links = re.findall(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', tr, re.DOTALL | re.IGNORECASE)
        for href, link_text in tr_links:
            clean_link_text = re.sub(r'<[^>]+>', ' ', link_text).strip()
            full_url = urllib.parse.urljoin(base_url, href)
            # Filter relevant map/study links
            if full_url.endswith(('.htm', '.html', '.jpg', '.png')) and not any(x in full_url for x in ['seek.php', 'email-author', 'amazon.com']):
                # Find contextual title from tr or td
                items.append({
                    "link_text": clean_link_text,
                    "row_context": ' '.join(tr_text.split())[:120],
                    "url": full_url,
                    "source": "bible_ca"
                })
    return items

if __name__ == '__main__':
    ktb = parse_knowingthebible()
    bca = parse_bible_ca()
    print(f"KnowingTheBible maps: {len(ktb)}")
    print(f"Bible.ca rows with links: {len(bca)}")
    print("\nSample Bible.ca items:")
    for it in bca[:20]:
        print(f"  [{it['link_text']}] {it['url']} | Context: {it['row_context'][:60]}")
