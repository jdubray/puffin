import sqlite3, json

conn = sqlite3.connect(r'C:\Users\jjdub\code\puffin\.puffin\puffin.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

ids = [
    '140af3da-86be-4c9b-b632-af7fa7d18a98',
    '322562ed-ab61-4a3a-ac78-c2ae5b611d81',
    '4bcc363b-fb34-49cf-884f-e562745018ec',
    '5175256a-03b0-408a-8d37-a4376e3a4cad',
    '578f291c-610d-4836-8d85-f109c1a67ebc',
    '8a2736c1-dc5d-4d4f-8373-9767881b4a3b',
    'bb038e8d-c838-491e-9192-1dc14213024b',
    'c854f39e-a51e-4b16-b847-946464255acb',
]
ph = ','.join(['?' for _ in ids])

# Stories
cur.execute(f'SELECT id, title, description, status, acceptance_criteria, inspection_assertions FROM user_stories WHERE id IN ({ph})', ids)
stories = {row['id']: dict(row) for row in cur.fetchall()}

# RIS
cur.execute(f'SELECT story_id, content FROM ris WHERE story_id IN ({ph})', ids)
ris_map = {row['story_id']: row['content'] for row in cur.fetchall()}

# Assertions from table
cur.execute(f'SELECT story_id, id, type, target, assertion, description FROM inspection_assertions WHERE story_id IN ({ph}) ORDER BY story_id', ids)
assertions_map = {}
for row in cur.fetchall():
    sid = row['story_id']
    if sid not in assertions_map:
        assertions_map[sid] = []
    assertions_map[sid].append(dict(row))

conn.close()

output = {'stories': stories, 'ris': ris_map, 'assertions': assertions_map}
with open(r'C:\Users\jjdub\code\puffin\scripts\stories-data.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, default=str)
print('Done')
