import re
import os

for f_name in ['migrations/0002_transparency_ledger.sql', 'migrations/0003_admin_ads_arbitration_livefinance.sql']:
    if os.path.exists(f_name):
        with open(f_name, 'r', encoding='utf-8') as f:
            content = f.read()

        content = re.sub(r'(?i)CREATE TABLE (?!IF NOT EXISTS)', 'CREATE TABLE IF NOT EXISTS ', content)
        content = re.sub(r'(?i)CREATE INDEX (?!IF NOT EXISTS)', 'CREATE INDEX IF NOT EXISTS ', content)

        with open(f_name, 'w', encoding='utf-8') as f:
            f.write(content)
