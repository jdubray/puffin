I now have a thorough picture of all 17 stories' implementation. Here is the full code review.

---

# Phase 3 Code Review

## Critical Bugs

### 1. Field name mismatch: `network_scan` result in cron-scheduler

**File:** `src/cron-scheduler.js:776`

```js
const unknownCount  = (scanResult.unknown_devices ?? []).length;
```

The `network_scan` tool returns `unknownDevices` (camelCase), not `unknown_devices`. This means `unknownCount` is always `0` and the alert block at line 779 never fires. The network scan cron task silently swallows all unknown device detections.

**Fix:** `scanResult.unknownDevices`

---

### 2. Field name mismatch: `webhook_hmac_verify` in anomaly classifier

**File:** `src/anomaly-classifier.js:159-161`

```js
function extractWebhookHmacVerify(data) {
  if (data.invalidHmacStatus === 401) return ['clean'];
  if (typeof data.invalidHmacStatus === 'number') return ['critical'];
```

The tool returns `status_code`, not `invalidHmacStatus`. The classifier will always hit the `return []` branch (line 163), treating every webhook result as unknown/unclassifiable — including a 200 response (HMAC not enforced).

**Fix:** Replace `data.invalidHmacStatus` with `data.status_code`.

---

### 3. Field name mismatch: `compliance_verify` in anomaly classifier

**File:** `src/anomaly-classifier.js:189-194`

```js
function extractComplianceVerify(data) {
  switch (data.status) {
```

The tool returns `{ findings, fail_count, warning_count, pass_count }` — there is no top-level `status` field. The switch always falls through to `default: return []`, meaning compliance failures are never escalated.

**Fix:** Replace with `fail_count`/`warning_count` checks:
```js
if (data.fail_count > 0)    return ['high'];
if (data.warning_count > 0) return ['medium'];
return ['clean'];
```

---

### 4. Field name mismatch: `token_rotation_remind` in anomaly classifier

**File:** `src/anomaly-classifier.js:172-177`

```js
function extractTokenRotationRemind(data) {
  if (Array.isArray(data.overdueCredentials) && data.overdueCredentials.length > 0) {
```

The tool returns `{ checked: [...], dueCount, emailSent }` — there is no `overdueCredentials` array. The classifier always returns `[]` regardless of overdue credentials.

**Fix:** `data.dueCount > 0` or check the `checked` array for `dueForRotation === true`.

---

### 5. Field name mismatch: `compliance_verify` result in cron-scheduler

**File:** `src/cron-scheduler.js:903-908`

```js
const verifyResult  = getLastToolOutput(sessionId, 'compliance_verify') ?? {};
const overallStatus = verifyResult.overallStatus ?? 'unknown';
```

The `compliance_verify` tool does not return `overallStatus` — it returns `fail_count`, `warning_count`, etc. `overallStatus` is always `'unknown'`, so the alert severity at line 908 is always `'info'` and never `'warning'`.

**Fix:** Derive status from `verifyResult.fail_count` / `verifyResult.warning_count`.

---

### 6. Field name mismatch: `webhook_hmac_verify` check in cron-scheduler

**File:** `src/cron-scheduler.js:929-931`

```js
const verifyResult = getLastToolOutput(sessionId, 'webhook_hmac_verify') ?? {};
const inactiveCount = (verifyResult.inactive ?? []).length;
```

The tool returns `{ verified: boolean, status_code, ... }` — there is no `inactive` array. `inactiveCount` is always `0` and the critical alert block at line 931 never fires.

**Fix:** `const hmacNotEnforced = verifyResult.verified === false && verifyResult.status_code === 200;`

---

## High Severity Issues

### 7. `pause_appliance` missing session.db logging (AC6 violation)

**File:** `src/tools/pause-appliance.js` (entire file)

The acceptance criterion explicitly states: "Logs to session.db with full incident context." The tool does not import `session-store` and makes no persistence call. No audit trail exists for this critical action.

**Fix:** Import `session-store` and call `createAlert` or equivalent after the stop command completes (success or failure), including `supervisor`, `service_name`, `stop_issued_at`, `verificationPass`, and `error`.

---

### 8. `pause_appliance` missing logger

**File:** `src/tools/pause-appliance.js:1-12`

All other tools import and use `createLogger`. `pause-appliance.js` has no logger import whatsoever. For the highest-risk tool in the system, this is a significant operational gap — stop commands, verification failures, and safety-check rejections produce no log output.

**Fix:** Add `const { createLogger } = require('../logger');` and `const log = createLogger('pause-appliance');`.

---

### 9. `token_rotation_remind` reads from credential store, not APPLIANCE.md (AC6 violation)

**File:** `src/tools/token-rotation-remind.js:118-135`

AC6 states: "Rotation dates are read from APPLIANCE.md, not from the credential store." The implementation reads `credentialStore.getMetadata(policy.name)` using `meta.created_at` as the last rotation date. This ties rotation tracking to when the secret was stored in COSA, not the actual operational rotation date.

---

### 10. `token_rotation_remind` sends email directly instead of via `ips_alert` (AC5 violation)

**File:** `src/tools/token-rotation-remind.js:176`

AC5 states: "Sends ips_alert at severity 'low' for any credential overdue for rotation." The tool calls `emailGateway.sendEmail` directly, bypassing the IPS alert pipeline. This means overdue credential events are not logged to `security_incidents`, not classified by the anomaly classifier, and do not participate in the FSM lifecycle.

---

### 11. `access_log_scan` severity field missing from output

**File:** `src/cron-scheduler.js:808` / `src/tools/access-log-scan.js`

The cron task reads `scanResult.severity` but the `access_log_scan` tool does not return a top-level `severity` field. The result object is `{ summary, anomalies, errorRatePercent, totalRequests, checked_at }`. The alert will always record `severity: 'warning'` regardless of actual threat level (e.g., a 'high' severity SQLi probe would be under-reported).

---

## Medium Severity Issues

### 12. `git_audit` repoPath validation rejects paths with spaces

**File:** `src/tools/git-audit.js:204`

```js
if (!/^\/[^\x00-\x1f;|&`$(){}[\]<>\\*?!~#]+$/.test(repoPath)) {
```

The character class does not include a space (`\x20`), so any repo path containing a space (e.g., `/home/user/my project`) will throw `Invalid repoPath` even though it's a legitimate path. Since the path is used with double quotes in the shell command (line 213), spaces are handled safely.

**Fix:** Add a space to the allowed set, or explicitly exclude only shell-special characters.

---

### 13. `looksLikeForcePush` generates high false positive rate

**File:** `src/tools/git-audit.js:160-163`

```js
const haystack = `${subject} ${refs}`.toLowerCase();
return haystack.includes('force') || haystack.includes('rebase');
```

Common legitimate commit subjects ("enforce coding standards", "reinforce validation", "refactor database", "release/v2.0-beta") will trigger `forcePushDetected = true` and `severity: 'high'`. The comment acknowledges this is a heuristic but the blast radius is large — any of these will escalate severity to 'high' and could trigger the FSM responding state.

---

### 14. `detectScannerAgents` breaks on IPv6 addresses

**File:** `src/tools/access-log-scan.js:294`

```js
const [ip] = key.split(':');
```

The key is built as `${e.ip}:${matched}` (line 286). For an IPv6 address like `::1`, splitting on `:` gives `['', '', '1:sqlmap']`. The extracted `ip` would be an empty string, making the anomaly output useless.

**Fix:** Build the key using a delimiter that can't appear in IPs: `${e.ip}||${matched}` and split on `||`.

---

### 15. `sanitizeOutput` base64 pattern is overly aggressive

**File:** `src/security-gate.js:33`

```js
{ label: 'Base64 secret', pattern: /[a-zA-Z0-9+/]{40}={0,2}/g },
```

This pattern matches any 40-character alphanumeric run, which includes SHA-256 hashes, JWT headers/payloads, git commit SHAs (if 40 chars), bcrypt hashes, and UUIDs with dashes removed. Entire git audit outputs and most database query results will have legitimate content redacted, making the tool output unreadable to the LLM.

---

### 16. `credential_audit` findings can duplicate across patterns

**File:** `src/tools/credential-audit.js:232-265`

Patterns are scanned sequentially with no deduplication. A line that matches both `base64_secret` and `password_assignment` (e.g., `password = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`) produces two separate findings for the same line. `totalFindingCount` will be inflated, potentially triggering higher severity than warranted.

---

### 17. `buildGitAuditTrigger` prompt describes wrong behavior

**File:** `src/cron-scheduler.js:154`

```js
message: `...inspect the appliance git repositories for uncommitted changes, untracked files, and suspicious commits.`
```

The `git_audit` tool inspects committed history (`git log --since`), not the working tree. The LLM prompt says "uncommitted changes" and "untracked files" which would lead Claude to attempt the wrong operations or misinterpret the tool's output.

---

## Low Severity Issues

### 18. `webhook_hmac_verify` potential double slash in URL

**File:** `src/tools/webhook-hmac-verify.js:102`

```js
const endpoint = `${baseUrl}${webhookPath}`;
```

If `baseUrl` ends with `/` and `webhookPath` starts with `/`, the URL becomes `http://host//api/webhooks/...`. Most servers tolerate double slashes but some strict implementations will return 404.

---

### 19. `ips_alert` alertRef is not guaranteed unique

**File:** `src/tools/ips-alert.js:179`

```js
const alertRef = `IPS-${Date.now()}`;
```

Two simultaneous alerts (e.g., FSM responding NAP + a direct cron alert) in the same millisecond would generate the same `alertRef`, breaking audit trail uniqueness. `crypto.randomUUID()` would be safer.

---

### 20. `pci_assessment` duplicates `parseSshdOption` and `parseListeningPorts`

**File:** `src/tools/pci-assessment.js:53-80`

Both helpers are copied verbatim from `compliance-verify.js`. If either is patched in one file, the other silently diverges. These should be extracted to a shared utility module.

---

### 21. `runAlertingOperatorNap` fires `ips_alert` without awaiting

**File:** `src/security-fsm.js:240-252`

```js
toolRegistry.dispatch('ips_alert', { ... }).then(...)
```

The fire-and-forget dispatch means `send('alerting_operator')` returns before the alert is sent. If the process restarts immediately after transitioning, the alert may never be sent. In `runRespondingNap` the same dispatch is awaited (line 210). The inconsistency is intentional (to avoid blocking the FSM), but the comment should clarify this and the ALERT_TIMEOUT window assumes the alert was sent.

---

## AC Coverage Gaps

| Story | AC | Gap |
|---|---|---|
| Story 1 | AC6 | "Unknown device connecting to appliance port → high" deferred to orchestrator layer with no implementation path documented |
| Story 13 | AC4 | `checked` array has no `daysUntilDue` field — only `ageDays` and `maxAgeDays`, so the caller must compute the difference |
| Story 13 | AC4 | No `reminders` array in output; the spec names this field specifically |
| Story 16 | AC6 | No session.db persistence (see bug #7 above) |

---

## Summary by File

| File | Bugs | Quality Issues |
|---|---|---|
| `src/anomaly-classifier.js` | 3 field mismatches (webhook, compliance, token-rotation) | — |
| `src/cron-scheduler.js` | 3 field mismatches (network-scan, webhook, compliance) + 1 severity gap | buildGitAuditTrigger prompt inaccurate |
| `src/tools/pause-appliance.js` | Missing session.db logging; missing logger | — |
| `src/tools/token-rotation-remind.js` | Reads from credential store not APPLIANCE.md; sends email not ips_alert | Missing `reminders` array, `daysUntilDue` |
| `src/tools/git-audit.js` | repoPath rejects spaces | looksLikeForcePush false positives |
| `src/tools/access-log-scan.js` | IPv6 key split bug | "SSH brute force" against HTTP logs |
| `src/security-gate.js` | — | Base64 pattern too broad |
| `src/tools/credential-audit.js` | — | No deduplication across patterns |
| `src/tools/pci-assessment.js` | — | Code duplication from compliance-verify |