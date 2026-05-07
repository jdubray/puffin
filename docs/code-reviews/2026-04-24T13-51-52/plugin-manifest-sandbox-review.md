# Code Review: Plugin Manifest & Sandbox Review

**Date:** 2026-04-24

## Summary
Scanned 14 plugin directories under `plugins/` against the nightly plugin-contract rules. All 14 manifests include the required fields (`name`, `version`, `displayName`, `description`, `main`) and all plugin `name` values are unique. The main issues are (1) two active plugins (`calendar`, `stats-plugin`) reach into the host's `src/main/` tree, breaking the plugin sandbox; (2) the majority of manifests declare `ipcHandlers` channels using a shortened namespace instead of the full plugin `name:` prefix required by the contract; and (3) nine plugin directories (including two `.disabled` ones) ship without a `package.json`. No IPC name collisions were found across plugins.

## Findings

- **[CRITICAL]** SANDBOX_HOST_REACH plugins/stats-plugin/index.js:9 — `require('../../src/main/metrics-service')` escapes the plugin directory and imports a host main-process module (confidence 95).
- **[CRITICAL]** SANDBOX_HOST_REACH plugins/calendar/index.js:21 — `path.resolve(__dirname, '../../src/main/database')` resolves outside the plugin directory into host `src/main/` (confidence 95).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/claude-config-plugin/puffin-plugin.json:21 — declared channels use `claude-config:` but plugin `name` is `claude-config-plugin`; every entry on lines 21–29 is prefixed incorrectly (confidence 90).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/code-review-plugin/puffin-plugin.json:22 — declared channels use `code-review:` but plugin `name` is `code-review-plugin`; all 10 entries on lines 22–31 are prefixed incorrectly (confidence 90).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/designer-plugin.disabled/puffin-plugin.json:13 — declared channels use `designer:` but plugin `name` is `designer-plugin`; lines 13–18 all mismatched (confidence 90).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/document-editor-plugin/puffin-plugin.json:13 — declared channels use `document-editor:` but plugin `name` is `document-editor-plugin`; 11 entries on lines 13–23 mismatched (confidence 90).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/document-viewer-plugin/puffin-plugin.json:17 — declared channels use `document-viewer:` but plugin `name` is `document-viewer-plugin`; lines 17–19 mismatched (confidence 90).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/excalidraw-plugin/puffin-plugin.json:13 — declared channels use `excalidraw:` but plugin `name` is `excalidraw-plugin`; all 13 entries on lines 13–25 mismatched (confidence 90).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/hdsl-viewer-plugin/puffin-plugin.json:13 — declared channels use `hdsl-viewer:` but plugin `name` is `hdsl-viewer-plugin`; lines 13–16 mismatched (confidence 90).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/prompt-template-plugin/puffin-plugin.json:12 — declared channels use `prompt-template:` but plugin `name` is `prompt-template-plugin`; three entries on line 12 mismatched (confidence 90).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/rlm-document-plugin/puffin-plugin.json:37 — declared channels use `rlm:` but plugin `name` is `rlm-document-plugin`; all 23 entries on lines 37–59 mismatched (confidence 95 — severe namespace shortening beyond the documented convention).
- **[IMPORTANT]** IPC_PREFIX_MISMATCH plugins/stats-plugin/puffin-plugin.json:12 — declared channels use `stats:` but plugin `name` is `stats-plugin`; both entries on line 12 mismatched (confidence 90).
- **[IMPORTANT]** MISSING_PACKAGE_JSON plugins/calendar/ — directory ships `index.js` and `puffin-plugin.json` but no `package.json` (confidence 85).
- **[IMPORTANT]** MISSING_PACKAGE_JSON plugins/claude-config-plugin/ — directory has `index.js` and manifest but no `package.json` (confidence 85).
- **[IMPORTANT]** MISSING_PACKAGE_JSON plugins/document-viewer-plugin/ — directory has `index.js` and manifest but no `package.json` (confidence 85).
- **[IMPORTANT]** MISSING_PACKAGE_JSON plugins/excalidraw-plugin/ — directory has `index.js` and manifest but no `package.json` (confidence 85).
- **[IMPORTANT]** MISSING_PACKAGE_JSON plugins/hdsl-viewer-plugin/ — directory has `index.js` and manifest but no `package.json` (confidence 85).
- **[IMPORTANT]** MISSING_PACKAGE_JSON plugins/outcome-lifecycle-plugin/ — directory has `index.js` and manifest but no `package.json` (confidence 85).
- **[IMPORTANT]** MISSING_PACKAGE_JSON plugins/toast-history-plugin/ — directory has `index.js` and manifest but no `package.json` (confidence 85).
- **[INFO]** SANDBOX_HOST_REACH plugins/memory-plugin.disabled/lib/claude-client.js:15 — `require('../../../src/main/metrics-service')` escapes into host `src/main/`. Plugin directory is suffixed `.disabled` and not loaded, but the file is still on disk (confidence 85).
- **[INFO]** MISSING_PACKAGE_JSON plugins/designer-plugin.disabled/ — disabled plugin directory missing `package.json` (confidence 80).
- **[INFO]** MISSING_PACKAGE_JSON plugins/memory-plugin.disabled/ — disabled plugin directory missing `package.json` (confidence 80).