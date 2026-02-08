# Plugin Storage Architecture

## ⚠️ CRITICAL REQUIREMENT

**All plugins MUST store data at the project level, never in centralized user directories.**

This ensures proper data isolation between projects and prevents data leakage.

---

## Storage Levels

### 1. ✅ PROJECT-LEVEL STORAGE (Recommended)

**Location**: `{projectPath}/.puffin/plugin-name/`

**Use for**:
- Plugin state and preferences (per project)
- Recent files lists
- Session history
- User-specific plugin data

**How to implement**:
```javascript
// In activate() method
const projectPath = context.projectPath || process.cwd()
const pluginDataPath = path.join(projectPath, '.puffin', 'my-plugin')

// Ensure directory exists
await fs.mkdir(pluginDataPath, { recursive: true })

// Store data files here
this.configPath = path.join(pluginDataPath, 'config.json')
this.sessionPath = path.join(pluginDataPath, 'sessions')
```

**Advantages**:
- ✅ Data isolation: Each project has its own data
- ✅ Reproducibility: Cloned repos start with clean slate
- ✅ Git integration: Can be added to `.gitignore` safely
- ✅ No data leakage across projects

### 2. ⚠️ PUFFIN PLUGIN STORAGE API (Conditional)

**Location**: Managed by Puffin (context-aware, typically per-project)

**Use for**:
- Plugin configuration that Puffin manages
- Global plugin settings (if available)

**Implementation**:
```javascript
// Use context.storage if provided
const config = await context.storage.get('config')
await context.storage.set('config', updatedConfig)
```

**Note**: This is Puffin-managed and may be context-aware. Verify with Puffin maintainers if you're unsure about isolation guarantees.

### 3. ❌ CENTRALIZED USER STORAGE (FORBIDDEN)

**Never use these patterns**:
```javascript
// ❌ WRONG - Data persists across projects
const userData = app.getPath('userData')
const pluginDir = path.join(userData, 'puffin-plugins', 'my-plugin')

// ❌ WRONG - Home directory storage
const homeDir = os.homedir()
const dataFile = path.join(homeDir, '.my-plugin-data')

// ❌ WRONG - Hardcoded absolute paths
const dataFile = '/home/user/.puffin-plugins/my-plugin/data.json'
```

**Why these are forbidden**:
- ❌ Data persists across multiple projects
- ❌ Projects can accidentally access data from other projects
- ❌ No data isolation
- ❌ Can't be version controlled
- ❌ Breaks reproducibility

---

## Real-World Example: Document Editor Plugin

### Before (WRONG - Centralized Storage)
```javascript
const { app } = require('electron')
const userData = app.getPath('userData')
const pluginDataPath = path.join(userData, 'puffin-plugins', 'document-editor')

// Problem: recent-files.json is GLOBAL across all projects
this.recentFilesPath = path.join(pluginDataPath, 'recent-files.json')
this.sessionPath = path.join(pluginDataPath, 'sessions')
```

**Issues**:
- Opening a document in Project A shows recent files from Project B
- Session history is shared across all projects
- User can see another project's document paths

### After (CORRECT - Project-Level Storage)
```javascript
const projectPath = context.projectPath || process.cwd()
const pluginDataPath = path.join(projectPath, '.puffin', 'document-editor')

// Correct: Each project has its own recent files
this.recentFilesPath = path.join(pluginDataPath, 'recent-files.json')
this.sessionPath = path.join(pluginDataPath, 'sessions')
```

**Benefits**:
- Recent files are per-project
- Session history is isolated per-project
- Each project starts with clean state
- Data can be committed to `.puffin/` in `.gitignore`

---

## Project Structure

```
my-project/
├── .git/
├── .puffin/
│   ├── document-editor/          # Document editor plugin data
│   │   ├── recent-files.json     # Recent files (this project only)
│   │   ├── editor-state.json     # Editor preferences (this project)
│   │   └── sessions/             # Session history (this project)
│   ├── prompt-templates/
│   │   └── templates.json        # Prompt templates (this project)
│   └── gui-definitions/          # Designer plugin definitions
├── .gitignore                    # Should include .puffin/
└── src/
```

---

## Implementation Checklist

Before implementing plugin storage:

- [ ] Storage uses `context.projectPath || process.cwd()`
- [ ] All data stored in `.puffin/plugin-name/` subdirectory
- [ ] Directories created with `fs.mkdir(..., { recursive: true })`
- [ ] No use of `app.getPath('userData')`
- [ ] No use of `os.homedir()` for plugin data
- [ ] No hardcoded absolute paths
- [ ] Documentation explains project-level isolation
- [ ] README notes that data is stored per-project
- [ ] Plugin cleanup removes only its own data from `.puffin/`

---

## Migration Guide

### For Existing Plugins Using Centralized Storage

1. **Identify current storage location**:
   ```bash
   grep -r "getPath('userData')" plugins/your-plugin/
   ```

2. **Update to project-level storage**:
   ```javascript
   // Old
   const userData = app.getPath('userData')
   const storePath = path.join(userData, 'plugin-data')

   // New
   const storePath = path.join(context.projectPath || process.cwd(), '.puffin', 'your-plugin')
   ```

3. **Store projectPath for reference**:
   ```javascript
   async activate(context) {
     this.projectPath = context.projectPath || process.cwd()
     // ...
   }
   ```

4. **Update any helper methods**:
   ```javascript
   // If you have methods that build storage paths:
   getStoragePath(filename) {
     return path.join(this.projectPath, '.puffin', 'my-plugin', filename)
   }
   ```

5. **Test data isolation**:
   - Open Plugin A in Project 1
   - Create some data
   - Switch to Project 2
   - Verify data from Project 1 is NOT visible
   - Switch back to Project 1
   - Verify original data is still there

---

## FAQ

**Q: What if the plugin needs to store global settings?**
A: Use Puffin's plugin storage API or store in the plugin's config.json directory. Contact Puffin team to discuss global plugin configuration needs.

**Q: What if context.projectPath is undefined?**
A: Fall back to `process.cwd()` which returns the current working directory (typically the project root when Puffin launches).

**Q: Can plugins share data between projects?**
A: No - each project has isolated `.puffin/` data. This is by design. If plugins need to share data, that's a Puffin-level feature, not a plugin feature.

**Q: What about plugin configuration?**
A: Plugin static configuration (like `config.json` in the plugin directory) can be committed to the repo. Project-specific overrides should go in `.puffin/plugin-name/`.

**Q: Should .puffin/ be in .gitignore?**
A: Yes, typically. It contains project-specific runtime data (sessions, preferences). Add `/.puffin/` to your `.gitignore` unless you want to track plugin data in Git.

---

## Affected Plugins - Status

### ✅ Refactored to Project-Level Storage
- **Document Editor Plugin** (`plugins/document-editor-plugin/`)
  - Recent files: `.puffin/document-editor/recent-files.json`
  - Editor state: `.puffin/document-editor/editor-state.json`
  - Sessions: `.puffin/document-editor/sessions/`

### ✅ Already Using Project-Level Storage
- **Prompt Template Plugin** - Uses `.puffin/prompt-templates.json`
- **Designer Plugin** - Uses `.puffin/gui-definitions/`

### ℹ️ Using Puffin Storage API
- **Calendar Plugin** - Uses `context.storage` API

### ✅ No Persistent Storage
- **Claude Config Plugin** - Reads/writes project files only
- **Stats Plugin** - Uses history service
- **Document Viewer Plugin** - Reads project docs
- **Toast History Plugin** - Delegated to core

---

## References

- **Plugin Development Guide**: `.claude/CLAUDE_plugin-development.md`
- **Document Editor Plugin (Refactored)**: `plugins/document-editor-plugin/index.js`
- **Prompt Template Plugin (Example)**: `plugins/prompt-template-plugin/index.js` (uses project-level storage)

