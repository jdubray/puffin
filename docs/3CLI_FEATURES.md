# Claude Code CLI Features & Puffin Integration Opportunities

This document reviews the current Claude Code CLI feature set and identifies integration opportunities within Puffin. Features are grouped by integration status.

---

## Currently Used (Enhancement Opportunities)

These features are already integrated but could be leveraged more deeply.

| Feature | Description | Puffin Relevance |
|---------|-------------|------------------|
| **Bidirectional Streaming** (`--input-format stream-json`, `--output-format stream-json`) | Enables real-time stdin/stdout JSON messaging with the CLI process. Supports sending prompts, receiving streamed responses, and injecting tool results mid-conversation. | Puffin uses this for interactive `AskUserQuestion` handling in `claude-service.js`. **Enhancement**: Could leverage streaming for live progress bars, token count tracking, and real-time cost estimation during sprint execution. |
| **Session Resumption** (`--resume <sessionId>`, `--continue`) | Resumes a previous conversation by session ID or continues the most recent session in the working directory. The `--fork-session` flag creates a new branch from an existing session without mutating it. | Puffin uses `--resume` for conversation continuity. **Enhancement**: `--continue` could simplify the "last session" UX. `--fork-session` could enable branching conversations — e.g., forking a planning session to try two different implementation approaches in parallel. |
| **Permission Modes** (`--permission-mode <mode>`) | Controls how Claude handles tool permissions. Modes include `default` (ask user), `acceptEdits` (auto-approve file changes), `plan` (read-only analysis), `bypassPermissions` (skip all checks), and `delegate` (defer to parent). | Puffin uses `acceptEdits` globally. **Enhancement**: Could use `plan` mode for the Specifications branch (read-only analysis), and allow per-branch permission mode configuration in the Claude Config Plugin. |
| **Model Selection** (`--model <model>`) | Sets the model for the session. Accepts aliases (`sonnet`, `opus`, `haiku`) or full model IDs. | Puffin passes model through to CLI. **Enhancement**: Could implement smart model routing — use `haiku` for title generation and quick queries, `sonnet` for implementation, `opus` for complex planning — configurable per story complexity rating. |
| **Disallowed/Allowed Tools** (`--disallowedTools`, `--allowedTools`) | Fine-grained control over which tools Claude can use during a session. Supports glob patterns like `Bash(git:*)`. | Puffin uses `--disallowedTools AskUserQuestion` in automated flows. **Enhancement**: Could use `--allowedTools` to restrict tools per branch type (UI branch: no `Bash(rm:*)`, Specifications branch: `Read` + `Grep` only). |

---

## Partially Used or Underutilized

These features have partial integration or are used indirectly.

| Feature | Description | Puffin Relevance |
|---------|-------------|------------------|
| **MCP Server Configuration** (`--mcp-config <configs...>`, `--strict-mcp-config`) | Load external MCP (Model Context Protocol) servers from JSON config files. `--strict-mcp-config` restricts to only the specified servers, ignoring user/project defaults. | Puffin's CRE uses the h-DSL MCP server, but configuration is implicit. **Opportunity**: Dynamically pass `--mcp-config` with project-specific MCP servers. Plugins could register their own MCP servers (e.g., a database query tool, a design system lookup). `--strict-mcp-config` ensures deterministic tool availability per session. |
| **System Prompt Injection** (`--system-prompt`, `--append-system-prompt`) | `--system-prompt` replaces the default system prompt entirely. `--append-system-prompt` adds to the default without replacing it. | Puffin uses `--system-prompt` for branch context. **Opportunity**: Switch to `--append-system-prompt` to preserve Claude's built-in capabilities while adding Puffin context. This avoids accidentally losing default behaviors like code safety checks. |
| **Max Budget** (`--max-budget-usd <amount>`) | Hard cap on API spend for a session. The CLI stops when the budget is reached. Only works with `--print`. | Not currently used. **Opportunity**: Enforce per-story or per-sprint budget limits. Could set a budget based on story complexity (e.g., Low=$2, Medium=$5, High=$10) and surface budget warnings in the sprint execution UI. Prevents runaway costs during auto-continue loops. |

---

## Not Yet Used (New Opportunities)

These features are available in the CLI but not yet integrated into Puffin.

| Feature | Description | Puffin Relevance |
|---------|-------------|------------------|
| **Custom Agents** (`--agent <name>`, `--agents <json>`) | Define named agents with custom descriptions and system prompts. Agents can be referenced by name in subsequent sessions, enabling specialized personas. | Could define Puffin-specific agents: `specWriter` (requirements analyst), `implementer` (code generator), `reviewer` (code review), `tester` (test writer). Each branch type could automatically select its agent. The CRE could dispatch different agents per sprint phase (planning vs. implementation vs. introspection). |
| **Structured Output** (`--json-schema <schema>`) | Validates Claude's response against a JSON Schema. Guarantees the output conforms to a specific structure or returns a validation error. | Currently, Puffin manually parses and validates JSON from Claude (story derivation, assertion generation, RIS). **Opportunity**: Pass schemas for each structured output type — story arrays, assertion maps, plan objects — eliminating fragile regex/bracket-matching extraction. Would dramatically simplify `extractStoriesFromResponse()` and assertion parsing. |
| **Fallback Model** (`--fallback-model <model>`) | Automatically falls back to a specified model when the primary is overloaded. Only works with `--print`. | Puffin has no overload handling — if the primary model is unavailable, operations fail. **Opportunity**: Set `--fallback-model sonnet` when using `opus` for planning, ensuring sprint execution doesn't stall during peak usage. Could also chain: primary=opus, fallback=sonnet for graceful degradation. |
| **Plugin System** (`--plugin-dir <paths...>`, `claude plugin`) | Load external plugins from directories. Plugins can extend Claude's tool set, add custom slash commands, and modify behavior. | Puffin has its own plugin architecture but doesn't leverage Claude Code's native plugin system. **Opportunity**: Bridge the two — Puffin plugins could register as Claude Code plugins, exposing Puffin-specific tools (read sprint state, query user stories, check assertion results) directly to Claude during implementation sessions. |
| **Additional Directories** (`--add-dir <directories...>`) | Grants Claude tool access to directories outside the project root. | Puffin operates within a single project directory. **Opportunity**: When implementing cross-project features (shared libraries, monorepo packages), `--add-dir` could grant access to sibling packages. Also useful for accessing shared design system files or documentation repositories. |
| **Session ID Control** (`--session-id <uuid>`) | Use a specific UUID for the session instead of auto-generating one. | Puffin tracks sessions via result messages. **Opportunity**: Pre-generate deterministic session IDs (e.g., `sprint-{sprintId}-story-{storyId}`) for easier correlation between Puffin's sprint tracking and Claude's session history. Simplifies debugging and session lookup. |
| **PR Integration** (`--from-pr <number\|url>`) | Resume a session linked to a pull request. Opens an interactive picker if no specific PR is given. | Not used. **Opportunity**: After sprint completion, Puffin could create a PR and link the implementation session to it. Subsequent review sessions could use `--from-pr` to resume with full PR context, enabling AI-assisted code review workflows. |

---

## Summary: Highest-Impact Integrations

Ranked by expected value to Puffin's workflow:

1. **`--json-schema`** — Eliminates brittle JSON extraction across 5+ code paths (stories, assertions, plans, RIS, introspection)
2. **`--agents`** — Enables purpose-built personas per branch type, improving output quality without prompt engineering overhead
3. **`--max-budget-usd`** — Critical safety net for sprint auto-continue loops; prevents cost overruns
4. **`--fallback-model`** — Resilience during peak API usage; keeps sprint execution moving
5. **`--append-system-prompt`** — Preserves Claude defaults while injecting Puffin context; safer than full replacement
6. **`--plugin-dir`** — Bridges Puffin and Claude Code plugin ecosystems for deep tool integration
7. **`--from-pr`** — Enables post-implementation review workflows tied to PRs