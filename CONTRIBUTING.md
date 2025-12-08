# Contributing to Puffin

Thank you for your interest in contributing to Puffin! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 18+
- Claude Code CLI installed globally: `npm install -g @anthropic-ai/claude-code`
- Git

### Development Setup

```bash
# Clone the repository
git clone https://github.com/jdubray/puffin.git
cd puffin

# Install dependencies
npm install

# Run in development mode (with DevTools)
npm run dev
```

## Project Structure

```
puffin/
├── src/
│   ├── main/           # Electron main process (Node.js)
│   ├── renderer/       # Electron renderer process (Browser)
│   │   ├── sam/        # SAM pattern implementation
│   │   └── components/ # UI components
│   └── shared/         # Shared utilities
├── tests/              # Test files
└── .puffin/            # Project state (gitignored)
```

## Coding Standards

### Style Guidelines

- **Language**: JavaScript (ES6+ modules)
- **Naming**: camelCase for variables and functions
- **Comments**: JSDoc for public methods and complex logic
- **Error Handling**: Use exceptions with try-catch blocks

### Architecture

Puffin uses the SAM (State-Action-Model) pattern:

```
User Intent → Action → Model → State → View
```

When adding features:
1. Define actions in `src/renderer/sam/actions.js`
2. Add acceptors in `src/renderer/sam/model.js`
3. Update state computation in `src/renderer/sam/state.js`
4. Create/update components in `src/renderer/components/`

### Electron Security

Always maintain these security settings:
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

All renderer-to-main communication must go through the preload script's IPC bridge.

## Making Changes

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates

### Commit Messages

Write clear, concise commit messages:
- Start with a verb (Add, Fix, Update, Remove)
- Keep the first line under 72 characters
- Reference issues when applicable

```
Add user story export functionality

- Implement export to markdown format
- Add export button to user stories view
- Update IPC handlers for file export

Fixes #123
```

### Pull Requests

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

In your PR description:
- Describe what changes you made and why
- Reference any related issues
- Include screenshots for UI changes

## Testing

```bash
# Run all tests
npm test
```

We use Node's built-in test runner with a BDD approach. Tests are located in the `tests/` directory.

## Reporting Issues

When reporting bugs, please include:
- Puffin version (check `package.json`)
- Operating system and version
- Claude Code CLI version (`claude --version`)
- Steps to reproduce
- Expected vs actual behavior
- Any error messages or logs

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to open an issue for questions or discussions about the project.
