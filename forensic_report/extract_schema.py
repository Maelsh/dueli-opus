import re
import codecs

try:
    with codecs.open('migrations/remote_export.sql', 'r', encoding='utf-8') as f:
        content = f.read()
except UnicodeDecodeError:
    with codecs.open('migrations/remote_export.sql', 'r', encoding='utf-16') as f:
        content = f.read()

matches = re.finditer(r'CREATE TABLE[\s\S]*?\);', content, re.IGNORECASE | re.MULTILINE)
with codecs.open('forensic_report/remote_schema.txt', 'w', encoding='utf-8') as f:
    for match in matches:
        f.write(match.group(0) + '\n---\n')
