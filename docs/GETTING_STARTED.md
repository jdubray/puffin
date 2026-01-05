# Getting Started with Puffin

A quick guide to get you up and running with Puffin in minutes.

## What is Puffin?

Puffin is a desktop application that wraps Claude Code CLI with a visual interface for managing AI-assisted development projects. It helps you organize prompts into user stories, track progress, and maintain context across coding sessions.

## Installation

### Option 1: Download (Recommended)

Download the latest release for your platform:

- **Linux**: [Puffin-0.1.0.AppImage](https://github.com/jdubray/puffin/releases/latest)
- **Windows**: Coming soon
- **macOS**: Coming soon

For Linux, make the AppImage executable:
```bash
chmod +x Puffin-0.1.0.AppImage
./Puffin-0.1.0.AppImage
```

### Option 2: Build from Source

```bash
# Clone and install
git clone https://github.com/jdubray/puffin.git
cd puffin
npm install

# Start the application
npm start
```

## Prerequisites

Before using Puffin, you need Claude Code CLI installed and authenticated:

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Authenticate (opens browser)
claude auth

# Verify it works
claude --version
```

## First Launch

1. **Open a Project**: On launch, Puffin prompts you to select a project directory. This is where your code lives.

2. **Puffin creates a `.puffin/` folder** in your project to store:
   - `config.json` - Project settings
   - `puffin.db` - User stories and sprint data
   - `history.json` - Conversation history

3. **Configure your project** (optional): Click the Config tab to set:
   - Project description
   - Programming style preferences
   - Testing approach
   - Documentation level

## Core Workflow

Puffin uses a **backlog-driven workflow**:

```
Write Specs → Derive Stories → Review → Backlog → Sprint → Implement → Complete
```

### Step 1: Write Specifications

In the **Prompt** view, describe what you want to build:

```
I want to build a todo app with the following features:
- Add and remove tasks
- Mark tasks as complete
- Filter by status
- Persist to local storage
```

### Step 2: Derive User Stories

Click **"Derive Stories"** and Claude will extract structured user stories from your specs. Each story has:
- Title
- Description ("As a user, I want...")
- Acceptance criteria

### Step 3: Review and Refine

Review proposed stories in the derivation panel:
- **Accept** stories that look good
- **Edit** stories that need tweaking
- **Reject** stories that don't fit

### Step 4: Manage Your Backlog

Accepted stories appear in the **Backlog** view:
- Drag stories to reorder priority
- Edit stories as requirements evolve
- Stories track status: Pending → In Progress → Completed

### Step 5: Start a Sprint

Select stories from the backlog and click **"Start Sprint"**:
1. Choose which stories to include
2. Claude generates an implementation plan
3. Stories move to "In Progress"

### Step 6: Implement

Work through sprint stories in the **Prompt** view:
- Each story has focused context
- Claude knows the acceptance criteria
- Track progress with the criteria checklist

### Step 7: Complete Stories

When all criteria are met:
1. Check off each acceptance criterion
2. Click **"Mark Complete"**
3. Story moves to Completed status

## Key Views

| View | Purpose |
|------|---------|
| **Config** | Project settings and Claude preferences |
| **Prompt** | Main interaction area with Claude |
| **Backlog** | User story management (Kanban board) |
| **Architecture** | System design documentation |
| **CLI Output** | Raw Claude output for debugging |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Submit prompt |
| `Ctrl+Shift+D` | Toggle SAM debugger |
| `Escape` | Cancel current operation |

## Tips for Success

1. **Start with clear specs**: The better your initial description, the better the derived stories.

2. **Keep stories small**: Break large features into multiple stories that can be completed in one session.

3. **Use branches**: Organize work into branches (Specs, UI, Backend) to keep context focused.

4. **Review architecture**: Use the Architecture view to document decisions as you build.

5. **Check the CLI output**: If something seems wrong, the CLI Output view shows exactly what Claude is doing.

## Troubleshooting

### "Claude not found"
Make sure Claude Code CLI is installed globally:
```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

### "Authentication required"
Run `claude auth` in your terminal to re-authenticate.

### App won't start
Try running with dev tools:
```bash
npm run dev
```
Check the console for error messages.

## Next Steps

- Read the [User Manual](USER_MANUAL.md) for detailed feature documentation
- Explore [Architecture](ARCHITECTURE.md) to understand how Puffin works
- Check [CHANGELOG](../CHANGELOG.md) for latest features

## Getting Help

- GitHub Issues: [github.com/jdubray/puffin/issues](https://github.com/jdubray/puffin/issues)
- Video Introduction: [Watch on YouTube](https://youtu.be/RzgzaSNgs1w)
