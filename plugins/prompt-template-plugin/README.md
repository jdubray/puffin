# Prompt Template Plugin

Manage and reuse prompt templates for Claude interactions within Puffin.

## Features

- Create, edit, and delete prompt templates
- Search templates by title or content
- Copy template content to clipboard
- Persistent storage in `.puffin/prompt-templates.json`
- Default templates for common use cases

## Installation

This plugin is bundled with Puffin and loads automatically on startup.

## Usage

1. Click the "Templates" tab in the navigation bar
2. Use the "Create New" button to add templates
3. Search templates using the search input
4. Click the copy icon to copy template content
5. Click the edit icon to modify a template
6. Click the delete icon to remove a template

## IPC Channels

All channels are prefixed with `prompt-template:`:

| Channel | Description | Arguments | Returns |
|---------|-------------|-----------|---------|
| `getAll` | Get all templates | None | `Template[]` |
| `save` | Create or update template | `Template` | `Template` |
| `delete` | Delete template by ID | `string` (id) | `boolean` |

## Data Model

```typescript
interface Template {
  id: string;        // UUID
  title: string;     // Required
  content: string;   // Required
  lastEdited: string; // ISO 8601 timestamp
}
```

## Storage

Templates are stored in `.puffin/prompt-templates.json` relative to the project root.

## Configuration

No additional configuration required. The plugin activates on startup.

## Development

### File Structure

```
prompt-template-plugin/
├── index.js              # Main process entry point
├── puffin-plugin.json    # Plugin manifest
├── package.json          # Plugin metadata
├── README.md             # This file
└── renderer/
    ├── components/
    │   ├── index.js
    │   └── PromptTemplateView.js
    └── styles/
        └── prompt-template.css
```

### Building

No build step required - the plugin uses vanilla JavaScript.

### Testing

Tests are located in `tests/plugins/prompt-template-plugin.test.js`.

## License

MIT
