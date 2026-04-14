import sqlite3
import os

db_path = r'.wrangler\state\v3\d1\miniflare-D1DatabaseObject\9f74acc5f0e4a14b143c36d08610fbe379f66380705f0e7c7b25617eb540e6e4.sqlite'
sql_path = 'remote_export.sql'

if not os.path.exists(sql_path):
    print("Error: remote_export.sql not found!")
    exit(1)

# Delete existing DB to ensure we start totally fresh without "table already exists" errors
if os.path.exists(db_path):
    os.remove(db_path)
    print("Deleted corrupted/partial local DB.")

with open(sql_path, 'r', encoding='utf-8') as f:
    sql_script = f.read()

print(f"Importing {len(sql_script)} bytes into local SQLite (Optimized mode)...")
try:
    conn = sqlite3.connect(db_path)
    # Disable synchronous writes for maximum speed during import
    conn.execute("PRAGMA synchronous = OFF;")
    conn.execute("PRAGMA journal_mode = MEMORY;")
    
    # Wrap in a transaction to avoid waiting for the disk on every row
    fast_script = f"BEGIN TRANSACTION;\n{sql_script}\nCOMMIT;"
    conn.executescript(fast_script)
    conn.close()
    print('Import successful! The local database is now an EXACT copy of the Cloudflare data.')
except Exception as e:
    print(f"An error occurred: {e}")
