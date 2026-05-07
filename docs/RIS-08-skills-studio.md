# RIS-08: Skills Studio

**Target**: Puffin 4.0
**Dependencies**: none
**Delivery**: plugin-only (`skills-studio-plugin`)
**Estimated effort**: 1.5 sprints

---

## 1. Motivation

Skills are Claude Code's lowest-context-cost extension mechanism. The paper's Table 2 is explicit: skills contribute only their descriptions to the prompt; full content loads on demand when the `SkillTool` is invoked. A SKILL.md file supports 15+ frontmatter fields: display name, description, allowed tools (granting access beyond the default tool set), argument hints, model overrides, execution context (`fork` for isolated execution), associated agent definitions, effort levels, and shell configuration. Authoring a skill today means hand-writing YAML frontmatter, getting the field names right, and testing by trying to invoke it — a workflow that discourages skill creation despite its low cost. The Memory Plugin already proves Puffin can capture domain knowledge; Skills Studio is the natural next step: a UI that makes authoring, testing, and managing skills as frictionless as writing markdown. Integration point: Claude Code's `~/.claude/skills/` and `<project>/.claude/skills/` directories, which are just folders of SKILL.md files.

## 2. User-facing behavior

- A new "Skills" sidebar item opens a three-pane layout:
  1. **Skill list** — tree view of all discovered skills, grouped by scope: Project (`<project>/.claude/skills/`), User (`~/.claude/skills/`), Bundled (if Puffin ships any), Plugin-contributed. Each skill shows its display name, description snippet, and a status dot (valid / invalid frontmatter).
  2. **Editor** — when a skill is selected, the editor shows a split view: on the left, a form for frontmatter fields (auto-validated); on the right, a markdown editor for the skill body. The form and markdown are synchronized: saving updates both the file's frontmatter and body.
  3. **Test sandbox** — a panel to invoke the selected skill in an isolated test session. The user enters arguments (if the skill declares them); Puffin spawns a Claude process with the skill active (`--settings` injecting a test-specific skill invocation), captures the output, and displays it.
- A "New Skill" button opens a scaffolding wizard: pick scope → pick template (blank, tool-wrapper, agent-style, fork-isolated) → enter name/description → create.
- Frontmatter validation catches: missing required fields, unknown fields (warning, not error), invalid tool names in the allowlist, malformed argument hints.
- A "Test in current project" action runs the skill against the live project instead of a clean sandbox.
- Skills can be duplicated across scopes (e.g., promote a project skill to user scope).
- A "Share" action exports the skill's SKILL.md with a comment header for distribution.

## 3. Architectural decisions

1. **SKILL.md is the source of truth.** Puffin reads and writes SKILL.md files directly; it does not duplicate skill metadata in the database. The file system is the registry.
2. **Frontmatter schema is versioned in code.** A TypeScript-like schema object in `skill-schema.js` enumerates the 15+ known fields with types, descriptions, and validation rules. Editing the schema is how Puffin tracks which fields are known for a given CLI version. Unknown fields are preserved on save (not stripped), just flagged as unknown.
3. **Testing uses an isolated Claude invocation.** The test sandbox runs `claude --print` with a project-scoped skill configuration and a synthesized prompt like "Use the `<skill-name>` skill with arguments `<args>` and report results." Output is captured via the existing stream-json parsing. This avoids any cross-contamination with the user's active branch session.
4. **Skill scopes follow Claude Code conventions.** Project skills go in `<project>/.claude/skills/<skill-name>/SKILL.md`; user skills in `~/.claude/skills/<skill-name>/SKILL.md`. Multi-file skills (SKILL.md + scripts + assets) live in the skill's directory; the editor handles the directory as a unit.
5. **Plugin-contributed skills are read-only in the UI.** Skills shipped by other plugins are shown but cannot be edited from the Skills Studio — edit by modifying the plugin. This prevents accidental plugin mutations.
6. **Validation is non-blocking.** Invalid frontmatter does not prevent saving (the user might be mid-edit). It is surfaced as visual indicators in the list and editor. Invalid skills are simply not invokable by Claude; Puffin surfaces the reason in the test sandbox if the user tries.

## 4. Data model

No schema changes. Plugin-scoped storage (`~/.puffin/plugin-data/skills-studio/`) holds user preferences (last-edited skill, UI layout) via the standard plugin storage API.

## 5. Main-process work

### Files created

- `src/main/services/skill-discovery.js` — `discoverAll(projectPath)` scans all four scopes and returns `[{ name, scope, path, frontmatter, body, valid, errors }]`.
- `src/main/services/skill-writer.js` — `write(skillPath, frontmatter, body)`, `create(scope, name, template)`, `delete(skillPath)`. YAML serialization preserves unknown fields.
- `src/main/services/skill-tester.js` — `test(skill, args, projectPath, options)` spawns an isolated Claude invocation and captures the result. Reuses `claude-service.js` spawn infrastructure with `isolated: true`.

### Files modified

- `src/main/ipc-handlers.js`: new `setupSkillsHandlers(ipcMain)`:
  - `skills:list` (invoke)
  - `skills:read` (invoke) — full SKILL.md with frontmatter parsed
  - `skills:write` (invoke) — save frontmatter + body
  - `skills:create` (invoke) — scaffold new skill
  - `skills:delete` (invoke)
  - `skills:duplicate` (invoke) — copy to another scope
  - `skills:test` (invoke) — run in sandbox
  - `skills:validate` (invoke) — schema check on a draft frontmatter object
- `src/main/preload.js`: expose `puffin.skills.*`.

### New IPC channels

As listed.

## 6. Renderer work

### Plugin manifest — `plugins/skills-studio-plugin/puffin-plugin.json`

```json
{
  "name": "skills-studio",
  "version": "1.0.0",
  "displayName": "Skills",
  "description": "Author, edit, and test Claude Code skills",
  "main": "index.js",
  "extensionPoints": {
    "components": ["skills-studio", "skill-editor", "skill-tester", "new-skill-wizard"]
  },
  "contributions": {
    "menus": {
      "sidebar": [{ "id": "skills", "label": "Skills", "icon": "🧪", "component": "skills-studio" }]
    }
  },
  "activationEvents": ["onStartup"]
}
```

### Files created

- `plugins/skills-studio-plugin/index.js`.
- `plugins/skills-studio-plugin/renderer/skills-studio.js` — top-level three-pane layout.
- `plugins/skills-studio-plugin/renderer/skill-tree.js` — left pane.
- `plugins/skills-studio-plugin/renderer/skill-editor.js` — split frontmatter-form / markdown-body editor.
- `plugins/skills-studio-plugin/renderer/frontmatter-form.js` — auto-generates form from `skill-schema.js`.
- `plugins/skills-studio-plugin/renderer/skill-schema.js` — authoritative schema definition for all known frontmatter fields.
- `plugins/skills-studio-plugin/renderer/skill-tester.js` — test sandbox UI.
- `plugins/skills-studio-plugin/renderer/new-skill-wizard.js` — creation wizard.
- `plugins/skills-studio-plugin/renderer/templates/blank.md`, `templates/tool-wrapper.md`, `templates/agent-style.md`, `templates/fork-isolated.md` — skill templates.
- `plugins/skills-studio-plugin/renderer/styles.css`.

## 7. Inspection assertions

```json
[
  { "id": "IA1", "criterion": "AC1", "type": "FILE_EXISTS", "target": "src/main/services/skill-discovery.js", "assertion": { "type": "file" }, "message": "Skill discovery service exists" },
  { "id": "IA2", "criterion": "AC1", "type": "EXPORT_EXISTS", "target": "src/main/services/skill-discovery.js", "assertion": { "exports": [{ "name": "discoverAll", "type": "function" }] }, "message": "discoverAll is exported" },
  { "id": "IA3", "criterion": "AC2", "type": "FILE_EXISTS", "target": "src/main/services/skill-writer.js", "assertion": { "type": "file" }, "message": "Skill writer service exists" },
  { "id": "IA4", "criterion": "AC2", "type": "EXPORT_EXISTS", "target": "src/main/services/skill-writer.js", "assertion": { "exports": [{ "name": "write", "type": "function" }, { "name": "create", "type": "function" }] }, "message": "Skill writer exposes write + create" },
  { "id": "IA5", "criterion": "AC3", "type": "FILE_EXISTS", "target": "src/main/services/skill-tester.js", "assertion": { "type": "file" }, "message": "Skill tester service exists" },
  { "id": "IA6", "criterion": "AC3", "type": "FUNCTION_SIGNATURE", "target": "src/main/services/skill-tester.js", "assertion": { "functionName": "test", "parameters": ["skill", "args", "projectPath", "options"] }, "message": "test() has correct signature" },
  { "id": "IA7", "criterion": "AC4", "type": "FILE_EXISTS", "target": "plugins/skills-studio-plugin/renderer/skill-schema.js", "assertion": { "type": "file" }, "message": "Schema module exists" },
  { "id": "IA8", "criterion": "AC5", "type": "FILE_EXISTS", "target": "plugins/skills-studio-plugin/renderer/templates/blank.md", "assertion": { "type": "file" }, "message": "Blank template exists" },
  { "id": "IA9", "criterion": "AC6", "type": "FILE_CONTAINS", "target": "src/main/preload.js", "assertion": { "pattern": "puffin.skills" }, "message": "Preload exposes skills API" }
]
```

## 8. Manual verification steps

1. Open Skills view on a fresh project. Verify it shows at least user-scope skills if any exist on the machine; empty state is acceptable otherwise.
2. Click "New Skill" → blank template → scope: project → name: `test-skill` → description: "Test skill". Verify a new directory is created at `<project>/.claude/skills/test-skill/` with a SKILL.md containing valid frontmatter.
3. Edit the skill's description in the form. Save. Verify the SKILL.md on disk reflects the change and frontmatter validation remains green.
4. Intentionally invalidate frontmatter (remove `name` field via the underlying file). Reload. Verify the skill shows a red status dot and the editor highlights the error.
5. Restore. Invoke the skill from the test sandbox with a synthesized argument. Verify output appears and the transcript shows `SkillTool` was called.
6. Duplicate the skill to user scope. Verify a copy appears at `~/.claude/skills/test-skill/`.
7. Delete the project skill. Verify it disappears from the list and the directory is removed.
8. Open a plugin-contributed skill. Verify the editor is read-only with a banner explaining why.
9. Share (export). Verify the exported text includes a header comment with scope and creation date.

## 9. Open questions

- Does Claude CLI support invoking a specific skill by name from a prompt in a reliable way, or is skill invocation model-mediated only? If the latter, the test sandbox synthesizes a prompt like "Use the X skill" and relies on the model to follow through. Flakiness is possible; document it.
- Multi-file skills: if a skill references a sibling script (e.g., `SKILL.md` + `helper.py`), the editor should show the whole directory. The file-tree UI within the editor handles this. Auto-discovery of sibling files is in scope for 4.0 if simple; file an enhancement otherwise.
- Plugin-contributed skills can live inside plugin packages. Are these discoverable via the plugin manifest's `contributions.skills` field? Clarify with the plugin manager; if not, extend the manifest schema.
- Should the editor offer a live-preview of the resolved skill (frontmatter + body as Claude sees it)? Nice-to-have; defer to 4.1.
- Backup behavior: when saving over an existing SKILL.md, should Puffin keep a `.bak` copy? Default yes, pruned to last 5 backups, hidden from the UI.

## 10. Milestones

- **M1** (week 1): `skill-discovery.js` + `skill-writer.js` + IPC + basic list view.
- **M2** (week 2): Editor (form + markdown) + schema validation + save flow.
- **M3** (week 3): Test sandbox + new-skill wizard + templates + duplicate/delete + docs.
