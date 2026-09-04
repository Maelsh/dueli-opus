import re
import codecs

with codecs.open('migrations/0001_initial_schema.sql', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'CREATE TABLE d1_migrations[\s\S]*?\);', '', content, flags=re.IGNORECASE)

with codecs.open('migrations/0001_initial_schema.sql', 'w', encoding='utf-8') as f:
    f.write(content.strip())
