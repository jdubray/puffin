#!/usr/bin/env python3
"""
fix-stuck-sprint.py  —  hard reset of the active sprint tables.

Clears EVERYTHING from `sprints` and `sprint_stories`.
Sprint history (sprint_history table) is NOT touched.
User stories are NOT deleted — just set back to 'completed'.

Usage:
    python scripts/fix-stuck-sprint.py <project-path>

Example:
    python scripts/fix-stuck-sprint.py C:\\Users\\jjdub\\code\\baanbaan\\Merchant
"""

import sys, os, sqlite3
from datetime import datetime, timezone

if len(sys.argv) < 2:
    print("Usage: python fix-stuck-sprint.py <project-path>")
    sys.exit(1)

project_path = sys.argv[1]
puffin_dir   = os.path.join(project_path, ".puffin")
db_path      = os.path.join(puffin_dir, "puffin.db")
json_path    = os.path.join(puffin_dir, "active-sprint.json")

if not os.path.exists(db_path):
    print(f"Database not found: {db_path}")
    sys.exit(1)

print(f"Opening: {db_path}\n")
con = sqlite3.connect(db_path)
con.row_factory = sqlite3.Row

# --- Show current state ---
sprints = con.execute("SELECT id, title, status, closed_at FROM sprints ORDER BY created_at").fetchall()
print(f"sprints table ({len(sprints)} rows):")
for s in sprints:
    print(f"  status={s['status']:<14} closed_at={repr(s['closed_at']):<32} \"{s['title']}\"")

links = con.execute("SELECT COUNT(*) FROM sprint_stories").fetchone()[0]
print(f"sprint_stories table: {links} rows\n")

if not sprints:
    print("sprints table is already empty.")
else:
    print("This will DELETE all rows from `sprints` and `sprint_stories`.")
    print("Sprint history (sprint_history) and user stories are NOT affected.\n")
    answer = input("Proceed? (yes/no): ").strip().lower()
    if answer != "yes":
        print("Aborted.")
        con.close()
        sys.exit(0)

    now = datetime.now(timezone.utc).isoformat()
    con.execute("PRAGMA foreign_keys = OFF")

    try:
        con.execute("BEGIN IMMEDIATE")
        con.execute("DELETE FROM sprint_stories")
        con.execute("DELETE FROM sprints")
        # Return any in-progress stories to pending so they show up in the backlog
        result = con.execute(
            "UPDATE user_stories SET status='pending', updated_at=? WHERE status='in-progress'",
            (now,)
        )
        con.execute("COMMIT")
        print(f"Cleared sprints table.")
        print(f"Cleared sprint_stories table.")
        if result.rowcount:
            print(f"Reset {result.rowcount} in-progress stories → pending.")
    except Exception as e:
        con.execute("ROLLBACK")
        print(f"Error (rolled back): {e}")
        con.close()
        sys.exit(1)

    con.execute("PRAGMA foreign_keys = ON")

# --- Delete JSON backup so migrator can't re-populate on restart ---
if os.path.exists(json_path):
    os.remove(json_path)
    print(f"Deleted backup: {json_path}")

# --- Final check ---
remaining = con.execute("SELECT COUNT(*) FROM sprints").fetchone()[0]
print(f"\nRows remaining in sprints: {remaining}")
history = con.execute("SELECT COUNT(*) FROM sprint_history").fetchone()[0]
print(f"Sprint history entries preserved: {history}")
print("\nDone. Restart Puffin — sprint history will still be there for Rerun.")
con.close()
