# Ollama SSH Integration Plan

## Executive Summary

This plan enables Puffin to route prompts to **Ollama models running on a remote SSH server** (`jjdubray@108.7.186.27`) instead of Claude CLI. The user has SSH key authentication already configured and wants to invoke models like:
- `mistral-small:latest` (14 GB)
- `qwen2.5-coder:14b` (9.0 GB)
- `deepseek-r1:14b` (9.0 GB)
- `llama3.2:latest` (2.0 GB)

**Key Design Decision:** Create a **parallel LLM provider system** that allows the user to select between **Claude** and **Ollama** models in the Model dropdown, with minimal changes to existing ClaudeService architecture.

---

## Architecture Overview

### Current Flow (Claude)
```
Prompt Editor → submitPrompt action → ClaudeService.submit() → spawn('claude') → stream JSON responses → update model
```

### Proposed Flow (Ollama)
```
Prompt Editor → submitPrompt action → LLM Router → OllamaService (new) → SSH tunnel → ollama run <model> → stream responses → update model
                                            ↓
                                     ClaudeService (existing, unchanged)
```

---

## Design Principles

1. **Non-Breaking:** Existing Claude workflows continue to work unchanged
2. **Provider Abstraction:** Introduce `LLMProvider` interface that both ClaudeService and OllamaService implement
3. **Model Dropdown Extension:** Model dropdown shows both Claude models (Opus/Sonnet/Haiku) and Ollama models (mistral-small, qwen2.5-coder, etc.)
4. **Unified Response Format:** Both providers emit the same response format so the renderer doesn't need to know which provider is active
5. **SSH Connection Pooling:** Reuse SSH connections across prompts (don't spawn new SSH connection for every prompt)

---

## Implementation Plan

### Story 1: Create LLM Provider Interface and Router

**Title:** Define LLM Provider Interface and Create Router Service

**Description:**
As a developer, I want a unified interface for LLM providers so that Puffin can support multiple backends (Claude, Ollama, future providers) without changing renderer code.

**Acceptance Criteria:**
1. `src/main/llm-provider-interface.js` defines the `LLMProvider` interface with methods:
   - `submit(prompt, options)` → returns Promise<response>
   - `cancel()` → cancels active request
   - `isRunning()` → returns boolean
   - `getAvailableModels()` → returns array of model names
2. `src/main/llm-router.js` created as a singleton router that:
   - Holds references to all registered providers (claudeProvider, ollamaProvider)
   - Routes `submit()` calls to the correct provider based on `options.provider` string
   - Routes `cancel()` calls to the currently active provider
   - Aggregates `getAvailableModels()` from all providers with provider prefix (e.g., `claude:opus`, `ollama:mistral-small`)
3. ClaudeService refactored to implement `LLMProvider` interface (no behavior changes, just interface compliance)
4. LLM Router registered in `src/main/index.js` main process startup
5. IPC handlers in `src/main/ipc-handlers.js` updated to call LLM Router instead of ClaudeService directly
6. All existing Claude functionality continues to work (zero regressions)

**Technical Notes:**
- The router is **stateless** — it just forwards calls to the right provider
- Provider selection logic: if `options.model` starts with `ollama:`, route to OllamaProvider; else route to ClaudeService
- ClaudeService remains the default provider (no config needed for existing workflows)

**Files to Create/Modify:**
- NEW: `src/main/llm-provider-interface.js`
- NEW: `src/main/llm-router.js`
- MODIFY: `src/main/claude-service.js` (add interface compliance, no behavior changes)
- MODIFY: `src/main/index.js` (initialize router)
- MODIFY: `src/main/ipc-handlers.js` (route through LLM Router)

**Complexity:** Medium

---

### Story 2: Implement OllamaService with SSH Tunnel

**Title:** Create OllamaService for Remote Model Execution via SSH

**Description:**
As a developer, I want an OllamaService that connects to a remote Ollama server via SSH and streams responses back to Puffin.

**Acceptance Criteria:**
1. `src/main/ollama-service.js` created implementing `LLMProvider` interface
2. Constructor accepts SSH config:
   ```js
   {
     host: '108.7.186.27',
     user: 'jjdubray',
     privateKeyPath: path.join(os.homedir(), '.ssh', 'id_rsa'), // or id_ed25519
     timeout: 10000
   }
   ```
3. `getAvailableModels()` returns hardcoded list initially:
   ```js
   ['ollama:mistral-small', 'ollama:qwen2.5-coder', 'ollama:deepseek-r1', 'ollama:llama3.2']
   ```
4. `submit(prompt, options)` method:
   - Spawns SSH command: `ssh -i <keyPath> jjdubray@108.7.186.27 "ollama run <model>"`
   - Writes `prompt.content` to stdin
   - Streams stdout back as response chunks
   - Handles stderr for error messages
   - Returns Promise that resolves with `{ content, duration, turns: 1 }`
5. `cancel()` method kills the SSH process (use `_killProcess()` helper from ClaudeService)
6. Connection management:
   - One SSH connection per prompt (simple v1 approach)
   - Future: connection pooling (not in this story)
7. Error handling:
   - SSH connection failures → reject Promise with descriptive error
   - Model not found → reject with "Model not available on server"
   - Timeout after 120 seconds (configurable via `options.timeout`)
8. Response format matches Claude's response format so renderer doesn't break:
   ```js
   {
     content: "...", // Full response text
     duration: 45000, // ms
     turns: 1,
     cost: 0, // Ollama is free
     sessionId: null // Ollama doesn't have session concept
   }
   ```

**Technical Notes:**
- Use Node.js `spawn()` with `ssh` command (don't use SSH libraries — simpler, fewer dependencies)
- Ollama CLI doesn't support JSON streaming like Claude — output is plain text
- No session resumption (each prompt is independent)
- No tool use (Ollama models in CLI mode can't use tools — this is prompt-response only)

**Edge Cases:**
- SSH key passphrase protected → prompt user for passphrase (or document that keys must be passphrase-free)
- Server unreachable → timeout and show error
- Model takes 5+ minutes to respond → show warning in CLI Output

**Files to Create:**
- NEW: `src/main/ollama-service.js`

**Complexity:** High

---

### Story 3: Extend Model Dropdown to Include Ollama Models

**Title:** Model Dropdown Shows Both Claude and Ollama Models

**Description:**
As a user, I want to see both Claude models and Ollama models in the Model dropdown so I can choose which backend to use for my prompt.

**Acceptance Criteria:**
1. Model dropdown (`#thread-model` in `index.html`) populated dynamically from LLM Router's `getAvailableModels()`
2. Dropdown structure:
   ```
   [Claude Models]
   - Opus
   - Sonnet
   - Haiku
   [Ollama Models]
   - Mistral Small
   - Qwen 2.5 Coder (14B)
   - DeepSeek R1 (14B)
   - Llama 3.2
   ```
3. Internal model values use provider prefix:
   - `claude:opus`, `claude:sonnet`, `claude:haiku`
   - `ollama:mistral-small`, `ollama:qwen2.5-coder`, `ollama:deepseek-r1`, `ollama:llama3.2`
4. `prompt-editor.js` reads selected model value and includes it in `submitPrompt()` action payload:
   ```js
   {
     content: "...",
     model: "ollama:mistral-small", // or "claude:opus"
     branchId: "...",
     ...
   }
   ```
5. SAM action `submitPrompt()` passes `model` through to IPC handler
6. IPC handler passes `model` to LLM Router, which routes to correct provider
7. Default model remains `claude:opus` (config.defaultModel)
8. Model selection persists per-thread (existing behavior)

**Technical Notes:**
- Use `<optgroup>` HTML elements to group models by provider
- Display names are human-friendly ("Mistral Small"), but values are provider-prefixed ("ollama:mistral-small")
- No UI changes needed beyond dropdown population logic

**Files to Modify:**
- `src/renderer/components/prompt-editor/prompt-editor.js` (populate dropdown, read selection)
- `src/renderer/sam/actions.js` (include `model` in `submitPrompt` payload)
- `src/main/ipc-handlers.js` (pass `model` to LLM Router)

**Complexity:** Low

---

### Story 4: Add Ollama Configuration to Config View

**Title:** Config View Allows Ollama SSH Configuration

**Description:**
As a user, I want to configure Ollama SSH settings in the Config view so I can connect to my remote server.

**Acceptance Criteria:**
1. Config view (`src/renderer/components/config/config.js`) adds new section: **"Remote LLM Server (Ollama)"**
2. Fields:
   - **Enable Ollama:** Checkbox (default: unchecked)
   - **SSH Host:** Text input (default: blank, placeholder: `108.7.186.27`)
   - **SSH User:** Text input (default: blank, placeholder: `jjdubray`)
   - **SSH Key Path:** Text input (default: `~/.ssh/id_rsa`, placeholder: `~/.ssh/id_rsa or ~/.ssh/id_ed25519`)
   - **Connection Timeout:** Number input (default: 10, unit: seconds)
3. Config stored in `.puffin/config.json`:
   ```json
   {
     "ollama": {
       "enabled": false,
       "ssh": {
         "host": "108.7.186.27",
         "user": "jjdubray",
         "keyPath": "~/.ssh/id_rsa",
         "timeout": 10000
       }
     }
   }
   ```
4. OllamaService initialization in `src/main/index.js` reads this config
5. If `ollama.enabled === false`, OllamaService not initialized and Ollama models don't appear in dropdown
6. If `ollama.enabled === true` but SSH connection fails on app startup → show warning toast (non-fatal)
7. "Test Connection" button in Config view that:
   - Spawns `ssh <user>@<host> "ollama list"`
   - Shows success toast with list of available models
   - Shows error toast if connection fails

**Technical Notes:**
- SSH key path supports `~` expansion (use `os.homedir()`)
- Timeout stored in milliseconds in config (convert from seconds in UI)
- Connection test is **optional** — user can save config without testing

**Files to Modify:**
- `src/renderer/components/config/config.js` (add Ollama section)
- `src/main/index.js` (initialize OllamaService from config)
- `src/main/ipc-handlers.js` (add `config:testOllamaConnection` handler)

**Complexity:** Medium

---

### Story 5: Update CLI Output to Show Provider Context

**Title:** CLI Output Distinguishes Between Claude and Ollama Responses

**Description:**
As a user, I want the CLI Output to show which provider (Claude or Ollama) is handling my prompt so I know what's happening.

**Acceptance Criteria:**
1. CLI Output logs include provider prefix:
   ```
   [Claude] Submitting prompt (model: claude:opus)
   [Claude] Response streaming started
   [Claude] 📖 Read (3 files)
   [Claude] Response complete (45.2s, $0.12)
   ```
   vs.
   ```
   [Ollama] Submitting prompt (model: ollama:mistral-small)
   [Ollama] SSH connection established to jjdubray@108.7.186.27
   [Ollama] Response streaming started
   [Ollama] Response complete (12.3s, $0.00)
   ```
2. LLM Router emits events that CLI Output listens to:
   - `llm:provider-selected` → `{ provider: 'claude' | 'ollama', model: '...' }`
   - `llm:connection-established` → `{ provider: 'ollama', host: '...' }`
   - `llm:response-start` → `{ provider: '...' }`
   - `llm:response-complete` → `{ provider: '...', duration, cost }`
3. CLI Output component subscribes to these events and formats logs accordingly
4. Existing Claude logs continue to work (no regressions)

**Technical Notes:**
- Events emitted via `ipcRenderer.send()` from main → renderer
- CLI Output already listens to multiple event types — this just adds more

**Files to Modify:**
- `src/main/llm-router.js` (emit events)
- `src/renderer/components/cli-output/cli-output.js` (listen and format)

**Complexity:** Low

---

## Architectural Decisions

### Why Not Use SSH2 Library?

**Decision:** Use `spawn('ssh')` instead of `ssh2` npm package.

**Rationale:**
1. **Simplicity:** User already has SSH keys configured. `spawn('ssh')` uses the system SSH client with zero config.
2. **Fewer Dependencies:** No need to add `ssh2` (adds ~500KB to bundle).
3. **Key Management:** System SSH client handles key passphrases, agent forwarding, known_hosts, etc. automatically.
4. **Future-Proof:** If user switches to SSH agent or different auth method, it just works.

**Trade-off:** No connection pooling initially (each prompt spawns new SSH connection). This is acceptable for v1 — Ollama responses are fast (10-30s), and connection overhead is ~500ms.

---

### Why Prefix Model Names with Provider?

**Decision:** Model values are `claude:opus`, `ollama:mistral-small` (not just `opus`, `mistral-small`).

**Rationale:**
1. **Collision Avoidance:** Prevents ambiguity if a provider adds a model with the same name.
2. **Explicit Routing:** LLM Router can route based on prefix without config lookups.
3. **Clarity:** User sees in logs which provider handled the prompt.

**Trade-off:** Model names are slightly longer in config/logs. Acceptable for clarity.

---

### Why Not Ollama HTTP API?

**Decision:** Use Ollama CLI (`ollama run`) instead of Ollama HTTP API (`http://localhost:11434/api/generate`).

**Rationale:**
1. **No Tunneling Complexity:** CLI over SSH is simpler than tunneling HTTP (requires SSH port forwarding or reverse proxy).
2. **Consistent with Claude:** Puffin uses Claude CLI, not Claude API. Using Ollama CLI keeps patterns consistent.
3. **No API Version Mismatches:** CLI is stable; HTTP API changes between Ollama versions.

**Trade-off:** CLI is slower than HTTP (extra SSH overhead), but still sub-second. Acceptable for v1.

---

## Migration Strategy

### Phase 1: Foundation (Stories 1-2)
- Implement provider interface and router (Story 1)
- Implement OllamaService (Story 2)
- **No user-visible changes yet** (Ollama not exposed in UI)
- **Goal:** Validate SSH connection and streaming work

### Phase 2: UI Integration (Stories 3-4)
- Expose Ollama models in Model dropdown (Story 3)
- Add Ollama config section (Story 4)
- **User can now use Ollama models**
- **Goal:** End-to-end prompt routing works

### Phase 3: Observability (Story 5)
- Add provider context to CLI Output (Story 5)
- **User can see which provider handled each prompt**
- **Goal:** Full transparency for debugging

---

## Testing Strategy

### Unit Tests (Optional for v1)
- LLM Router routes to correct provider based on model prefix
- OllamaService formats responses correctly

### Integration Tests (Manual)
1. **SSH Connection Test:**
   - Config view → Enable Ollama → Test Connection → success toast
2. **Ollama Prompt Test:**
   - Select `ollama:mistral-small` in Model dropdown
   - Submit prompt: "Write a Python function to reverse a string"
   - Verify response appears in conversation area
   - Verify CLI Output shows `[Ollama]` logs
3. **Claude Prompt Test (Regression):**
   - Select `claude:opus` in Model dropdown
   - Submit prompt: "Write a Python function to reverse a string"
   - Verify response appears (same as before)
   - Verify CLI Output shows `[Claude]` logs
4. **Model Switch Test:**
   - Submit prompt with `claude:opus`
   - Wait for response
   - Switch to `ollama:mistral-small`
   - Submit another prompt
   - Verify both responses appear correctly

---

## Edge Cases and Error Handling

### SSH Connection Failures
**Scenario:** Server unreachable, key not found, permission denied.

**Handling:**
- OllamaService rejects Promise with descriptive error
- Response Viewer shows error message
- CLI Output shows `[Ollama] Connection failed: <reason>`
- User is NOT blocked — can switch to Claude and continue

### SSH Key Passphrase Protected
**Scenario:** User's SSH key requires passphrase.

**Handling (v1):** Document that SSH keys must be passphrase-free OR configured in SSH agent.

**Handling (v2 - future):** Prompt user for passphrase on first connection attempt (requires SSH2 library or interactive SSH).

### Ollama Model Not Available
**Scenario:** User selects `ollama:qwen2.5-coder` but model not on server.

**Handling:**
- `ollama run` returns error: `Error: model "qwen2.5-coder" not found`
- OllamaService detects error in stderr
- Reject Promise with `ModelNotFoundError`
- Response Viewer shows: "Model 'qwen2.5-coder' not available on server. Run 'ollama pull qwen2.5-coder' on the remote server."

### Very Long Responses
**Scenario:** Ollama model generates 10,000+ token response.

**Handling:**
- Stream response in chunks (same as Claude)
- No response size limit (Ollama doesn't enforce limits like Claude does)
- If response exceeds 100KB → show warning in CLI Output

### Concurrent Prompts
**Scenario:** User submits second prompt while first Ollama prompt is still running.

**Handling (v1):** Block submission (same as Claude's current behavior — `_processLock` prevents concurrent prompts).

**Handling (v2 - future):** Queue prompts or allow concurrent (requires SSH connection pooling).

---

## Performance Considerations

### SSH Connection Overhead
- **First connection:** ~500ms (SSH handshake)
- **Subsequent prompts:** ~500ms per prompt (no connection reuse in v1)
- **Acceptable?** Yes for v1. Response generation (10-30s) dominates connection overhead.

### Response Streaming
- Ollama CLI streams output line-by-line (not word-by-word like Claude)
- Puffin buffers lines and emits chunks every 100ms (same as Claude)
- **Perceived performance:** Similar to Claude

### Model Load Time (Server-Side)
- Large models (14B params) take 5-15s to load into VRAM on first use
- Ollama keeps models in VRAM for 5 minutes after last use (configurable)
- **User impact:** First prompt after idle period is slower (expected, document in UI)

---

## Security Considerations

### SSH Key Storage
- **Current:** Key at `~/.ssh/id_rsa` (user's home directory)
- **Risk:** Puffin can read private key (but doesn't store it, just passes path to SSH)
- **Mitigation:** Document that Puffin never transmits SSH keys (only used locally by system SSH client)

### Remote Code Execution
- **Risk:** If SSH credentials compromised, attacker can execute arbitrary code on remote server
- **Mitigation:** User is already using SSH keys for direct SSH access (no new risk introduced by Puffin)

### Prompt Content Leakage
- **Risk:** Prompts sent to remote server via SSH
- **Mitigation:** SSH traffic is encrypted (standard SSH protocol)
- **Note:** User's prompts are already sent to Claude (Anthropic servers). Ollama on user's own server is MORE private, not less.

---

## Future Enhancements (Not in v1)

### 1. SSH Connection Pooling
- Reuse single SSH connection across multiple prompts
- Reduces connection overhead from 500ms → ~0ms

### 2. Dynamic Model Discovery
- `getAvailableModels()` calls `ssh <user>@<host> "ollama list"` on app startup
- Dynamically populates Model dropdown with server's actual models

### 3. Ollama Tool Use (Experimental)
- Ollama supports tools via API (not CLI)
- Would require switching to HTTP API with SSH tunnel

### 4. Model Temperature/Top-P Controls
- Add UI controls for model parameters (`--temperature`, `--top-p` flags)
- Pass through to `ollama run` command

### 5. Multi-Server Support
- User configures multiple Ollama servers
- Model dropdown shows: `Server A - mistral-small`, `Server B - qwen2.5-coder`

---

## Summary Table

| Story | Title | Complexity | Files Created | Files Modified |
|-------|-------|-----------|---------------|----------------|
| 1 | LLM Provider Interface and Router | Medium | 2 | 3 |
| 2 | OllamaService with SSH Tunnel | High | 1 | 0 |
| 3 | Extend Model Dropdown | Low | 0 | 3 |
| 4 | Ollama Configuration in Config View | Medium | 0 | 3 |
| 5 | CLI Output Provider Context | Low | 0 | 2 |

**Total New Files:** 3
**Total Modified Files:** 11
**Estimated Effort:** 3-4 days (1 day per story, plus testing/docs)

---

## Success Criteria

1. ✅ User can enable Ollama in Config view and test SSH connection
2. ✅ Model dropdown shows both Claude and Ollama models
3. ✅ User can select `ollama:mistral-small` and submit a prompt
4. ✅ Response streams back and appears in conversation area (same UX as Claude)
5. ✅ CLI Output shows `[Ollama]` logs with provider context
6. ✅ Existing Claude workflows continue to work (zero regressions)
7. ✅ User can switch between Claude and Ollama mid-session
8. ✅ Error messages are clear and actionable (e.g., "SSH connection failed: Permission denied")

---

## Rollout Plan

### Alpha Release (Internal Testing)
- Enable Ollama in config
- Test with all 4 models on your server
- Validate SSH connection stability
- Verify response formatting matches Claude

### Beta Release (Documentation)
- Write user guide: "Using Ollama with Puffin"
- Document SSH key setup (passphrase-free requirement)
- Add troubleshooting section (connection errors, model not found)

### GA Release (Optional Features)
- Connection pooling (if Alpha shows performance issues)
- Dynamic model discovery (if users request it)
- Multi-server support (if users have multiple Ollama servers)

---

## Open Questions

1. **Should Ollama prompts be logged to metrics?**
   - **Recommendation:** Yes, log to `metrics_events` table with `component='ollama'`.
   - **Benefit:** Track usage patterns, compare Claude vs. Ollama performance.

2. **Should Ollama responses be saved to conversation history?**
   - **Recommendation:** Yes, same as Claude (stored in `.puffin/state.json`).
   - **Benefit:** User can review past Ollama conversations.

3. **Should Ollama support sprint execution?**
   - **Recommendation:** No in v1 (Ollama CLI has no tool use → can't read/write files).
   - **Future:** If Ollama adds tool support, revisit.

4. **Should Model dropdown remember last selection per branch?**
   - **Recommendation:** Yes, same as current behavior (model selection persists per thread).
   - **Benefit:** User doesn't have to re-select model every time.

---

## Next Steps

1. **Review this plan** — validate architectural decisions
2. **Create user stories in Backlog** — one story per section above
3. **Prioritize Story 1** — implement provider interface and router first
4. **Test SSH connection** — verify `ssh jjdubray@108.7.186.27 "ollama run llama3.2"` works from Puffin's context
5. **Implement Stories 2-5** — follow sequential order (each story depends on previous)

---

## Appendix: SSH Command Examples

### Test SSH Connection
```bash
ssh jjdubray@108.7.186.27 "ollama list"
```
Expected output:
```
NAME                    ID              SIZE      MODIFIED
mistral-small:latest    8039dd90c113    14 GB     3 days ago
qwen2.5-coder:14b       9ec8897f747e    9.0 GB    3 days ago
deepseek-r1:14b         c333b7232bdb    9.0 GB    3 days ago
llama3.2:latest         a80c4f17acd5    2.0 GB    3 days ago
```

### Submit Prompt via SSH
```bash
echo "Write a Python function to reverse a string" | ssh jjdubray@108.7.186.27 "ollama run llama3.2"
```
Expected output:
```
Here's a simple Python function that reverses a string:

def reverse_string(s):
    return s[::-1]

# Example usage:
print(reverse_string("hello"))  # Output: olleh
```

### Test Timeout Handling
```bash
timeout 5s ssh jjdubray@108.7.186.27 "ollama run deepseek-r1:14b" <<< "Explain quantum computing in 5000 words"
```
Expected: Command exits after 5s (for testing timeout behavior).

---

**End of Plan**
