---
description: Send completed fix/improvement summary to Puffin's Improvements branch
---

Generate a concise summary of what was accomplished in this Claude Code session:

1. **Issue/Request**: What was the original problem or feature request?
2. **Changes Made**: List the files that were modified and what was changed
3. **Key Decisions**: Any important decisions or trade-offs made
4. **Notes**: Any follow-up items or things to be aware of

Format this as a structured summary, then run the puffin-sync script to save it:

```bash
node .claude/scripts/puffin-sync.js
```

Pass the summary via stdin as JSON with this structure:
```json
{
  "title": "Brief title of the fix/improvement",
  "content": "The full summary text",
  "files": ["list", "of", "modified", "files"]
}
```
