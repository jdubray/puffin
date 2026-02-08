# GitHub Capability — Technical Summary

This document describes how Puffin integrates with GitHub: authentication, API interactions, data flow, and how GitHub data is used within the application.

## 1. Overview

Puffin's GitHub integration provides two capabilities:

1. **Developer Profile Integration**: Connect a GitHub account to sync developer identity, view repositories, and display recent activity. Implemented in `developer-profile.js`.
2. **Plugin Installation from GitHub**: Fetch and install Claude Code plugins hosted on GitHub repositories. Implemented in `puffin-state.js`.

Both use the GitHub REST API v3 over HTTPS. There is no server-side component — all communication happens directly from the Electron main process.

## 2. Authentication

Puffin supports two authentication methods, both managed by `DeveloperProfileManager` in `src/main/developer-profile.js`.

### OAuth Device Flow (Recommended)

The Device Flow is designed for desktop/CLI apps that cannot securely store a client secret. This is the same approach used by VS Code and GitHub Desktop.

**Configuration:**

```javascript
const GITHUB_CONFIG = {
  clientId: 'Ov23liUkVBHmYgqhqfnP',  // Public — intentional for Device Flow
  scope: 'read:user user:email repo',
  deviceAuthUrl: 'https://github.com/login/device/code',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  apiBaseUrl: 'https://api.github.com'
}
```

**Flow:**

```
1. INITIATE       User clicks "Connect GitHub" in the Developer Profile UI
                   → renderer calls window.puffin.github.startAuth()
                   → IPC → DeveloperProfileManager.startGithubAuth()

2. DEVICE CODE    POST to github.com/login/device/code with client_id + scope
                   → GitHub returns { device_code, user_code, verification_uri,
                     expires_in, interval }

3. BROWSER AUTH   shell.openExternal(verification_uri) opens default browser
                   → User enters user_code on github.com/login/device
                   → User authorizes the Puffin OAuth App

4. TOKEN POLL     Renderer calls window.puffin.github.pollToken(deviceCode, interval, expiresIn)
                   → IPC → DeveloperProfileManager.pollForGithubToken()
                   → Polls POST to github.com/login/oauth/access_token every {interval} seconds
                   → Handles 'authorization_pending' (keep polling),
                     'slow_down' (increase interval by 5s),
                     and errors
                   → On success: receives { access_token, token_type, scope }

5. COMPLETE       DeveloperProfileManager.completeGithubAuth(tokenInfo)
                   → Saves credentials (encrypted)
                   → Fetches GitHub profile via /user API
                   → Updates developer-profile.json with GitHub data
                   → Auto-fills empty profile fields (name, email, avatar, bio)

6. RETURN         IPC returns { success: true, profile } to renderer
                   → SAM action GITHUB_AUTH_SUCCESS dispatched
                   → UI updates to show connected state + repos/activity
```

**Timeout**: The entire poll loop is bounded by `expiresIn` (typically 900 seconds / 15 minutes from GitHub). If the user doesn't authorize in time, the flow rejects with "GitHub authorization timed out".

### Personal Access Token (PAT)

For advanced users who prefer direct token authentication:

1. User generates a PAT at `github.com/settings/tokens` with scopes `read:user`, `user:email`, `repo`
2. User enters the PAT in the Developer Profile UI
3. `connectWithPAT(token)` validates the token format (must start with `ghp_` or `github_pat_`)
4. Token is wrapped as `{ accessToken, tokenType: 'bearer', scope }` and passed to `completeGithubAuth()` — the same completion flow as OAuth

### Credential Storage

Credentials are stored in `github-credentials.json` in Electron's `userData` directory:
- **Windows**: `%APPDATA%/puffin/github-credentials.json`
- **macOS**: `~/Library/Application Support/puffin/github-credentials.json`
- **Linux**: `~/.config/puffin/github-credentials.json`

**Encryption**: Uses Electron's `safeStorage.encryptString()` to encrypt the JSON-serialized credentials. The encrypted data is stored as base64. If `safeStorage.isEncryptionAvailable()` returns false, falls back to plaintext JSON storage (with a code comment noting this is not recommended for production).

**Credential shape (in memory)**:
```json
{
  "accessToken": "ghp_...",
  "tokenType": "bearer",
  "scope": "read:user user:email repo"
}
```

**On-disk shape (encrypted)**:
```json
{ "encrypted": "<base64 string>" }
```

**On-disk shape (plain fallback)**:
```json
{ "plain": { "accessToken": "...", "tokenType": "...", "scope": "..." } }
```

## 3. GitHub API Interactions

All API requests are made via `DeveloperProfileManager.githubApiRequest()`, which uses Node.js `https` module directly (no external HTTP library).

### Request Pattern

```javascript
githubApiRequest(endpoint, options = {}) {
  // 1. Load credentials from encrypted storage
  // 2. Build request to https://api.github.com{endpoint}
  // 3. Set headers: Accept (v3 JSON), Authorization (Bearer token), User-Agent (Puffin-App)
  // 4. Parse JSON response
  // 5. Extract rate limit headers (x-ratelimit-remaining, x-ratelimit-reset, x-ratelimit-limit)
  // 6. Return { data, rateLimit } or throw on 4xx/5xx
}
```

### API Endpoints Used

| Endpoint | Method | Purpose | Called By |
|----------|--------|---------|-----------|
| `/user` | GET | Fetch authenticated user profile | `fetchGithubProfile()` |
| `/user/repos` | GET | List user's repositories | `fetchGithubRepositories()` |
| `/users/{login}/events` | GET | Fetch user's recent activity | `fetchGithubActivity()` |

### Repository Fetching

`fetchGithubRepositories(options)` supports query parameters:
- `sort`: Default `'updated'`
- `direction`: Default `'desc'`
- `per_page`: Default `30`
- `page`: Default `1`

### Activity Fetching

`fetchGithubActivity(perPage)` first fetches the user profile to get the login, then queries `/users/{login}/events`. Default `perPage` is 30.

### Rate Limiting

Every API response includes rate limit data extracted from response headers:
```javascript
{ remaining: number, reset: number, limit: number }
```

This is returned alongside response data and can be dispatched to the SAM model via `UPDATE_GITHUB_RATE_LIMIT` action. The UI does not currently display rate limit warnings.

## 4. Developer Profile and GitHub Connection Lifecycle

### Profile Storage

The developer profile is stored in `developer-profile.json` in Electron's `userData` directory (same location as credentials). It contains both local profile data and synced GitHub data:

```json
{
  "name": "Developer Name",
  "email": "dev@example.com",
  "avatar": "https://avatars.githubusercontent.com/...",
  "bio": "...",
  "preferredCodingStyle": "HYBRID",
  "preferences": { ... },
  "github": {
    "connected": true,
    "id": 12345,
    "login": "dev-username",
    "name": "Developer Name",
    "email": "dev@example.com",
    "avatarUrl": "https://avatars.githubusercontent.com/...",
    "company": "Company Name",
    "location": "City, Country",
    "bio": "GitHub bio text",
    "publicRepos": 42,
    "followers": 100,
    "following": 50,
    "createdAt": "2015-01-01T00:00:00Z",
    "htmlUrl": "https://github.com/dev-username"
  },
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Connection Lifecycle

```
DISCONNECTED
  → User clicks "Connect GitHub" or enters PAT
  → Auth flow completes (see Section 2)
  → profile.github.connected = true
  → GitHub fields populated from /user API
  → Empty local profile fields auto-filled from GitHub

CONNECTED
  → User can: view repos, view activity, refresh profile
  → "Refresh" button calls refreshGithubProfile() → re-fetches /user
  → Repos and activity are fetched in parallel on connect and on demand

DISCONNECTED (again)
  → User clicks "Disconnect"
  → Credentials file deleted
  → profile.github reset to DEFAULT_PROFILE.github (connected: false, all fields null/0)
  → Profile file saved with cleared GitHub data
```

### SAM State Model

The renderer tracks GitHub state via `model.developerProfile`:

| Field | Type | Purpose |
|-------|------|---------|
| `isAuthenticated` | boolean | Whether GitHub is connected |
| `isAuthenticating` | boolean | Whether OAuth flow is in progress |
| `authError` | string\|null | Last auth error message |
| `profile` | object | GitHub user data (login, avatar, stats, etc.) |
| `repositories` | array | Fetched repos (id, name, description, language, stars, forks) |
| `recentActivity` | array | Fetched events (type, repo, createdAt, payload) |
| `selectedRepository` | string\|null | Currently selected repo ID |
| `contributions` | object | Contribution stats (total, thisWeek, thisMonth) |
| `settings` | object | GitHub integration settings |
| `rateLimitRemaining` | number | API rate limit remaining |
| `rateLimitReset` | number | Rate limit reset timestamp |
| `lastFetched` | number | Last data fetch timestamp |

### SAM Actions

| Action | Trigger |
|--------|---------|
| `START_GITHUB_AUTH` | OAuth flow initiated |
| `GITHUB_AUTH_SUCCESS` | Auth completed, profile received |
| `GITHUB_AUTH_ERROR` | Auth failed |
| `GITHUB_LOGOUT` | User disconnects |
| `LOAD_GITHUB_REPOSITORIES` | Repos fetched from API |
| `SELECT_GITHUB_REPOSITORY` | User selects a repo |
| `LOAD_GITHUB_ACTIVITY` | Activity events fetched |
| `UPDATE_GITHUB_CONTRIBUTIONS` | Contribution stats updated |
| `UPDATE_GITHUB_SETTINGS` | Settings changed |
| `UPDATE_GITHUB_RATE_LIMIT` | Rate limit info received |

## 5. How GitHub Data Is Used Within Puffin

### Developer Profile UI

The `DeveloperProfileComponent` (`src/renderer/components/developer-profile/developer-profile.js`) provides:

- **GitHub user card**: Shows avatar, name, login (@username link), company, location
- **Stats display**: Public repos count, followers, following
- **Repository list**: Top 10 repos sorted by update date, showing name, description, language, stars, forks. Links to GitHub.
- **Activity feed**: Recent 10 events with type-specific icons (Push, PR, Issue, Create, Fork, Star, Comment, Review) and time-ago formatting
- **Connection management**: Connect (OAuth or PAT), Disconnect, Refresh buttons
- **Profile auto-fill**: On first connect, empty profile fields are populated from GitHub data

### Plugin Installation from GitHub

`puffin-state.js` uses GitHub for Claude Code plugin installation:

1. **URL parsing** (`parseGitHubUrl()`): Extracts `owner`, `repo`, `branch`, and `path` from GitHub URLs. Constructs a `rawBase` URL pointing to `raw.githubusercontent.com` for direct file access.

2. **Plugin validation** (`validateClaudePlugin()`): Fetches `{rawBase}/.claude-plugin/plugin.json` to read plugin metadata (name, description, version, author).

3. **Plugin installation** (`addClaudePlugin()`): Fetches `{rawBase}/skills/{pluginName}/SKILL.md` for the plugin's skill content, generates a plugin ID, and installs it locally.

This is exposed to the renderer via `window.puffin.state.validateClaudePlugin(source, 'github')` and `window.puffin.state.addClaudePlugin(source, 'github')`.

## 6. Potential Improvements

### Authentication
- **Token refresh**: No token refresh mechanism exists. OAuth Device Flow tokens can expire or be revoked; the app would silently fail on API calls without clear user feedback.
- **Token validation on startup**: The app doesn't verify the stored token is still valid on launch. A revoked token would only be discovered on the next API call.
- **Scoped tokens**: The `repo` scope grants broad access. A more minimal scope (e.g., `public_repo` only) could reduce exposure for users who don't need private repo access.

### API Usage
- **No Octokit**: GitHub API calls use raw `https.request()`. Using `@octokit/rest` would provide better error handling, pagination, retry logic, and type safety.
- **No pagination**: Repository listing fetches a single page (default 30 repos). Users with many repos see an incomplete list.
- **Activity fetching inefficiency**: `fetchGithubActivity()` calls `fetchGithubProfile()` first to get the login — an extra API call. The login is already stored on `profile.github.login` and could be read from the saved profile.
- **No caching**: Every refresh fetches fresh data from GitHub. Local caching with TTL would reduce API calls and improve responsiveness.
- **Rate limit tracking exists but is unused**: The `UPDATE_GITHUB_RATE_LIMIT` action and SAM state fields exist but no UI warns the user when approaching rate limits.

### UI/UX
- **No PR creation**: Despite having the `repo` scope, Puffin cannot create pull requests or issues via GitHub. This is a natural extension given the sprint/story workflow.
- **No issue tracking integration**: Stories could be linked to GitHub issues for bidirectional status sync.
- **Repository selection has no effect**: `SELECT_GITHUB_REPOSITORY` action and `selectedRepository` state exist but nothing consumes the selection — no downstream workflow uses the selected repo.
- **No contribution graph**: `UPDATE_GITHUB_CONTRIBUTIONS` action exists but the contributions data is never populated from the API (GitHub's contribution graph requires authenticated GraphQL or scraping).

### Security
- **Plain-text fallback**: When `safeStorage.isEncryptionAvailable()` returns false, credentials are stored in plain JSON. This should at minimum warn the user.
- **No credential rotation**: No mechanism to rotate or re-authenticate tokens.

### Plugin System
- **No authentication for plugin repos**: Plugin installation from GitHub only works with public repositories (uses unauthenticated raw content fetching). Private repos would fail silently.
- **No version pinning**: Plugin installation doesn't track or pin GitHub commit SHAs. Reinstalling could pull breaking changes.

## 7. Known Limitations

1. **No PR/Issue creation**: The GitHub integration is read-only for the user's identity and repos. Despite having `repo` scope, no write operations (PRs, issues, comments) are implemented.

2. **Single-page repo listing**: Only fetches the first page of repositories (30 max). No "load more" or pagination support.

3. **Activity feed is limited**: Only shows the public events API, which captures pushes, PRs, issues, and stars — but not private repo activity even though the `repo` scope grants access.

4. **No webhook or real-time updates**: All data is fetched on-demand. There's no mechanism to receive push notifications when repos or activity change.

5. **No multi-account support**: Only one GitHub account can be connected at a time. The credential and profile storage is designed for a single identity.

6. **Windows encryption dependency**: `safeStorage` encryption depends on DPAPI on Windows, Keychain on macOS, and libsecret on Linux. If these OS services are unavailable, credentials fall back to plaintext storage.

7. **PAT format validation is shallow**: Only checks prefix (`ghp_` or `github_pat_`). Invalid or expired tokens are not detected until the first API call fails.

8. **Plugin installation requires specific repo structure**: Plugins must have `.claude-plugin/plugin.json` at the expected path and `skills/{name}/SKILL.md`. Non-standard layouts silently fail.

## Appendix: IPC Handler Reference

| Channel | Purpose |
|---------|---------|
| `github:connectWithPAT` | Connect using Personal Access Token |
| `github:startAuth` | Start OAuth Device Flow |
| `github:openAuth` | Open verification URI in browser |
| `github:pollToken` | Poll for access token after user authorizes |
| `github:isConnected` | Check if GitHub is connected |
| `github:disconnect` | Disconnect GitHub account |
| `github:refreshProfile` | Refresh profile data from GitHub API |
| `github:getRepositories` | Fetch user's repositories |
| `github:getActivity` | Fetch user's recent activity events |

## Appendix: File Map

| File | Purpose |
|------|---------|
| `src/main/developer-profile.js` | Core GitHub integration — auth, API, credentials, profile sync |
| `src/main/ipc-handlers.js` | IPC bridges for all 9 GitHub handlers (lines ~1748–1839) |
| `src/main/preload.js` | Exposes `window.puffin.github.*` to renderer (lines ~450–484) |
| `src/main/puffin-state.js` | Plugin installation from GitHub repos (`validateClaudePlugin`, `addClaudePlugin`, `parseGitHubUrl`) |
| `src/renderer/components/developer-profile/developer-profile.js` | Profile UI — GitHub card, repos, activity, auth flow |
| `src/renderer/sam/actions.js` | 10 GitHub-related SAM action creators |
| `src/renderer/sam/model.js` | 10 GitHub-related SAM acceptors |
| `tests/developer-profile.test.js` | Unit tests for DeveloperProfileManager |
