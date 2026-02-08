# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Puffin, please report it responsibly:

1. **Do not** open a public issue
2. Email the maintainer or open a private security advisory on GitHub
3. Include detailed steps to reproduce the vulnerability
4. Allow reasonable time for a fix before public disclosure

## Security Boundary

Puffin is a **management and orchestration layer**, not an execution environment. Understanding this boundary is critical to the security model:

- **Puffin's role**: Tracks, organizes, and visualizes Claude Code CLI (3CLI) outputs. Provides context and configuration to 3CLI sessions.
- **3CLI's role**: Performs all code execution, file operations, and codebase modifications. 3CLI operates as a subprocess with its own security controls (permission modes, human-in-the-loop for file writes).
- **Puffin does NOT**: Execute arbitrary code, write to project files directly (except `.puffin/` state), or grant AI autonomous tool access.

### Context Sanitization

When Puffin passes user-generated content (stories, descriptions, feedback, documents) to 3CLI as prompt context, all content is wrapped in explicit `--- BEGIN / END ---` delimiters. This establishes clear boundaries between system instructions and user-provided data, reducing the risk of prompt injection through tracked content.

### Git Hook Awareness

Puffin checks for active (non-`.sample`) Git hooks when opening a repository and warns the user if any are found. Git hooks are executable scripts that run automatically during Git operations and could be a vector for code execution if a repository has been tampered with.

## Security Model

### Electron Security

Puffin follows Electron security best practices:

- **Context Isolation**: Enabled - renderer cannot access Node.js directly
- **Node Integration**: Disabled - prevents arbitrary code execution
- **Sandbox**: Enabled - renderer process is sandboxed
- **Preload Script**: All IPC communication goes through a controlled API bridge

### Data Storage

**Local Storage Locations:**
- Project state: `.puffin/` directory within your project
- Developer profile: OS-specific app data directory
  - Windows: `%APPDATA%/puffin/`
  - macOS: `~/Library/Application Support/puffin/`
  - Linux: `~/.config/puffin/`

**What's Stored:**
- Project configuration (name, description, coding preferences)
- Conversation history (prompts and responses)
- User stories and architecture documents
- UI guidelines and design tokens
- GitHub OAuth tokens (encrypted)

**What's NOT Stored:**
- Anthropic API keys (managed by Claude Code CLI)
- Passwords or secrets (GitHub uses OAuth Device Flow)

### GitHub Integration

- Uses OAuth Device Flow - no client secret required
- Access tokens are encrypted using Electron's `safeStorage` API
- Tokens are stored locally, never transmitted to third parties
- Requested scopes: `read:user`, `user:email`, `repo`

### Claude Code CLI

Puffin spawns Claude Code as a subprocess:
- Prompts are passed via stdin (not command-line arguments)
- The CLI runs in the context of your project directory
- File operations are performed by Claude Code, not Puffin directly
- Puffin has `--permission-mode acceptEdits` enabled by default

### Network Communication

Puffin makes network requests only to:
- `github.com` - OAuth authentication
- `api.github.com` - Profile and repository data

All Claude API communication is handled by the Claude Code CLI, not Puffin.

## Best Practices for Users

1. **Review prompts** before submitting - Claude Code can modify files
2. **Use version control** - keep your project in git to track changes
3. **Review changes** - check what Claude Code modified after each prompt
4. **Limit scope** - use specific prompts rather than broad instructions
5. **Disconnect GitHub** when not needed - revoke access from Profile settings

## Known Limitations

- Debug logging may output prompt previews to the console (development mode only)
- `.puffin/` directory contains conversation history in plain text
- GitHub tokens are encrypted but accessible to anyone with local machine access
