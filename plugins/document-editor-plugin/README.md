# Document Editor Plugin

Text document editor with syntax highlighting and AI assistance for Puffin.

## Features

- Create, open, and save text documents
- Syntax highlighting for multiple languages (via highlight.js)
- Auto-save functionality with configurable toggle
- Line numbers with scroll sync
- AI assistance prompt area (AI integration coming soon)
- Recent files tracking (up to 10 files)
- File watching for external changes
- Support for common file types (.md, .txt, .js, .ts, .html, .css, .json, .py, etc.)

## Installation

This plugin is bundled with Puffin and loads automatically on startup.

## Usage

1. Click the "Editor" tab in the navigation bar
2. Use "New" to create a new document or "Open" to open an existing file
3. Edit your document with syntax highlighting
4. Save manually or enable auto-save for automatic saving

## IPC Channels

All channels are prefixed with `document-editor:`:

| Channel | Description | Arguments | Returns |
|---------|-------------|-----------|---------|
| `createFile` | Create new file via save dialog | `{ defaultName }` | `{ path, content, extension }` or `{ canceled }` |
| `openFile` | Open file via dialog | None | `{ path, content, extension }` or `{ canceled }` |
| `readFile` | Read file by path | `{ path }` | `{ content, extension }` or `{ error }` |
| `saveFile` | Save content to file | `{ path, content }` | `{ success }` or `{ error }` |
| `getRecentFiles` | Get recent files list | None | `Array<{ path, displayName, lastOpened }>` |
| `addRecentFile` | Add to recent files | `{ path }` | `{ success }` |
| `watchFile` | Watch for external changes | `{ filePath }` | `{ success }` |
| `unwatchFile` | Stop watching file | `{ filePath }` | `{ success }` |

## Syntax Highlighting

The editor uses [highlight.js](https://highlightjs.org/) for syntax highlighting with a dark theme optimized for Puffin's UI. Highlighting is applied automatically based on file extension.

**Supported Languages:**
- JavaScript/TypeScript (`.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs`)
- HTML/XML (`.html`, `.htm`, `.xml`, `.svg`, `.vue`, `.svelte`)
- CSS/SCSS (`.css`, `.scss`, `.sass`, `.less`)
- JSON/YAML (`.json`, `.yaml`, `.yml`)
- Python (`.py`)
- Ruby (`.rb`)
- Go (`.go`)
- Rust (`.rs`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`, `.h`, `.hpp`, `.cc`)
- C# (`.cs`)
- Swift (`.swift`)
- Kotlin (`.kt`, `.kts`)
- PHP (`.php`)
- SQL (`.sql`)
- GraphQL (`.graphql`, `.gql`)
- Bash/Shell (`.sh`, `.bash`, `.zsh`)
- PowerShell (`.ps1`, `.psm1`)
- Markdown (`.md`, `.markdown`)
- And more...

## Supported File Types

The editor supports the following file extensions:
- Text: `.txt`, `.md`
- JavaScript/TypeScript: `.js`, `.ts`, `.jsx`, `.tsx`
- Web: `.html`, `.css`, `.scss`, `.json`
- Config: `.yaml`, `.yml`, `.xml`
- Programming: `.py`, `.rb`, `.go`, `.rs`, `.java`, `.c`, `.cpp`, `.h`
- Shell: `.sh`, `.bash`, `.zsh`, `.ps1`, `.bat`
- Data: `.sql`, `.graphql`

## Auto-Save

The editor includes intelligent auto-save functionality:

- **Enabled by default**: Documents are automatically saved after 1.5 seconds of inactivity
- **Toggle control**: Use the "Auto-save" checkbox in the toolbar to enable/disable
- **Visual indicators**:
  - Green dot = Saved
  - Yellow dot = Unsaved changes
  - Spinner = Saving in progress
  - Red dot = Save failed
- **Manual save**: When auto-save is disabled, use the Save button or `Ctrl+S`
- **Save on close**: Pending changes are saved when the view is destroyed
- **UTF-8 encoding**: All files are saved with UTF-8 encoding

## Configuration

No additional configuration required. The plugin activates on startup.

## Data Storage

Plugin data is stored in the user's application data directory:

```
{userData}/puffin-plugins/document-editor/
└── recent-files.json    # Recently opened files list
```

Where `{userData}` is:
- **Windows**: `%APPDATA%\puffin`
- **macOS**: `~/Library/Application Support/puffin`
- **Linux**: `~/.config/puffin`

## Development

### File Structure

```
document-editor-plugin/
├── index.js                    # Main process entry point
├── puffin-plugin.json          # Plugin manifest
├── package.json                # Plugin metadata
├── README.md                   # This file
└── renderer/
    ├── components/
    │   ├── index.js            # Component exports
    │   └── DocumentEditorView.js  # Main view component
    └── styles/
        └── document-editor.css # Plugin styles
```

### Building

No build step required - the plugin uses vanilla JavaScript.

### Testing

Tests are located in `tests/plugins/document-editor-plugin.test.js`.

## Known Limitations

### File Watching

The plugin uses Node.js `fs.watch()` for detecting external file changes. This has some platform-specific behaviors:

- **Windows**: File watching is generally reliable but may report multiple events for a single change
- **macOS**: Uses FSEvents which is reliable for most use cases
- **Linux**: Behavior depends on the filesystem:
  - **ext4, btrfs**: Generally reliable via inotify
  - **NFS, network mounts**: May not work reliably or at all
  - **Docker/WSL2**: May have limited functionality depending on configuration

If you experience issues with external change detection:
1. Save the file in Puffin to ensure you have the latest version
2. Close and reopen the file to manually refresh
3. Disable auto-save if conflicts occur frequently

**Note**: A future enhancement may include using the [chokidar](https://github.com/paulmillr/chokidar) library for more reliable cross-platform file watching.

## Future Enhancements

- AI assistance integration for document analysis and generation
- Multiple document tabs
- Find and replace functionality
- Code folding
- Minimap navigation
- More reliable cross-platform file watching (chokidar)

## License

MIT
