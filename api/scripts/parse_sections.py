import re
import urllib.parse

with open('scratch_bible_ca.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Let's find table sections
sections = re.split(r'(SERMON OUTLINE MAPS[^\n<]+|Chronology/Timeline[^\n<]+|Master Archeological Bible Study Map)', html)
print(f'Total sections: {len(sections)}')
for i in range(1, len(sections), 2):
    sec_name = sections[i]
    sec_body = sections[i+1]
    # find links
    links = re.findall(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', sec_body, re.DOTALL | re.IGNORECASE)
    print(f'\n=== {sec_name.strip()} === ({len(links)} links)')
    for h, t in links[:12]:
        t_clean = re.sub(r'<[^>]+>', ' ', t).strip()
        print(f'   {t_clean[:40]} -> {h}')
