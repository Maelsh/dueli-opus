import glob
import re

for file in glob.glob('src/models/**/*.ts', recursive=True):
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        match = re.search(r'tableName\s*=\s*[\'"]([^\'"]+)[\'"]', content)
        if match:
            print(f"{file}: {match.group(1)}")
