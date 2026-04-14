import re

with open('migrations/0003_admin_ads_arbitration_livefinance.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

# Remove the entire CREATE TABLE admin_audit_logs block and its indexes
sql = re.sub(r'CREATE TABLE IF NOT EXISTS admin_audit_logs.*?;', '', sql, flags=re.DOTALL | re.IGNORECASE)
sql = re.sub(r'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_.*?;\n', '', sql, flags=re.IGNORECASE)

# Remove platform_financial_logs
sql = re.sub(r'CREATE TABLE IF NOT EXISTS platform_financial_logs.*?;', '', sql, flags=re.DOTALL | re.IGNORECASE)
sql = re.sub(r'CREATE INDEX IF NOT EXISTS idx_platform_financial_logs_.*?;\n', '', sql, flags=re.IGNORECASE)

# Remove platform_donations_ledger
sql = re.sub(r'CREATE TABLE IF NOT EXISTS platform_donations_ledger.*?;', '', sql, flags=re.DOTALL | re.IGNORECASE)
sql = re.sub(r'CREATE INDEX IF NOT EXISTS idx_platform_donations_ledger_.*?;\n', '', sql, flags=re.IGNORECASE)

with open('migrations/0003_admin_ads_arbitration_livefinance.sql', 'w', encoding='utf-8') as f:
    f.write(sql)
