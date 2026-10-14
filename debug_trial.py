import sqlite3
conn = sqlite3.connect('db.sqlite3')
cursor = conn.cursor()
cursor.execute('PRAGMA table_info(tenants)')
columns = cursor.fetchall()
print('Tenants table columns:')
for col in columns:
    print(f'  {col}')
print()
cursor.execute('SELECT id, name, is_trial, limit_calls, usage_calls FROM tenants LIMIT 5')
rows = cursor.fetchall()
print('Sample tenants:')
for row in rows:
    print(f'  {row}')
conn.close()