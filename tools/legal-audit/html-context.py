import html
import json
import pathlib
import re
import sys
sys.stdout.reconfigure(encoding='utf-8')

filename, literal = sys.argv[1:3]
source = pathlib.Path(filename).read_text(encoding='utf-8')
clean = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', source, flags=re.I | re.S)
rows = re.findall(r'<tr\b[^>]*>.*?</tr>', clean, flags=re.I | re.S)
matches = []
for row in rows:
    text = html.unescape(re.sub(r'<[^>]+>', ' ', row))
    text = re.sub(r'\s+', ' ', text).strip()
    if literal.casefold() in text.casefold():
        links = re.findall(r'href\s*=\s*[\'"]([^\'"]+)', row, flags=re.I)
        matches.append({'text': text[:1200], 'links': [html.unescape(x) for x in links if len(x) < 1000]})
if not matches:
    text = html.unescape(re.sub(r'<[^>]+>', ' ', clean))
    text = re.sub(r'\s+', ' ', text).strip()
    for match in list(re.finditer(re.escape(literal), text, flags=re.I))[:6]:
        matches.append({'text': text[max(0, match.start()-180):match.end()+650]})
print(json.dumps(matches[:12], ensure_ascii=False, indent=2))
