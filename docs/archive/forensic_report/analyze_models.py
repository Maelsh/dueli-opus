import glob
import re
import codecs

tables = {}

for file in glob.glob('src/models/**/*.ts', recursive=True):
    with codecs.open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        
        # Find table name
        table_match = re.search(r'tableName\s*=\s*[\'"]([^\'"]+)[\'"]', content)
        if not table_match:
            continue
        table_name = table_match.group(1)
        
        # Try to find the interface that corresponds to the model
        # Typically right before the class or matching the file name roughly.
        # We can look for `export interface ModelName {`
        interface_names = re.findall(r'export\s+interface\s+(\w+)\s*{([^}]+)}', content)
        if interface_names:
            tables[table_name] = interface_names

with codecs.open('forensic_report/models_analysis.txt', 'w', encoding='utf-8') as f:
    for t_name, interfaces in tables.items():
        f.write(f"=== TABLE: {t_name} ===\n")
        for i_name, i_body in interfaces:
            f.write(f"Interface: {i_name}\n{i_body.strip()}\n\n")

