# Puffin Plugin Manifest Reference

This document describes the `puffin-plugin.json` manifest file format for Puffin plugins.

## Overview

Every Puffin plugin must include a `puffin-plugin.json` file in its root directory. This manifest declares the plugin's metadata, capabilities, and extension points.

## Quick Start

Here's a minimal valid manifest:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "displayName": "My Plugin",
  "description": "A brief description of what my plugin does",
  "main": "index.js"
}
```

## Full Example

```json
{
  "name": "puffin-analytics",
  "version": "1.0.0",
  "displayName": "Analytics Dashboard",
  "description": "Track prompt usage and response metrics with visual dashboards",
  "main": "src/index.js",
  "author": {
    "name": "Developer Name",
    "email": "dev@example.com",
    "url": "https://example.com"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/user/puffin-analytics"
  },
  "homepage": "https://github.com/user/puffin-analytics#readme",
  "bugs": "https://github.com/user/puffin-analytics/issues",
  "keywords": ["analytics", "metrics", "dashboard"],
  "engines": {
    "puffin": ">=2.0.0"
  },
  "dependencies": {
    "puffin-charts": "^1.0.0"
  },
  "extensionPoints": {
    "actions": ["trackPrompt", "generateReport"],
    "acceptors": ["analyticsAcceptor"],
    "reactors": ["onPromptComplete"],
    "components": ["analytics-dashboard", "metrics-panel"],
    "ipcHandlers": ["analytics:getData", "analytics:export"]
  },
  "activationEvents": ["onStartup"],
  "contributes": {
    "commands": [
      {
        "id": "puffin-analytics.showDashboard",
        "title": "Show Analytics Dashboard",
        "category": "Analytics"
      }
    ],
    "configuration": {
      "title": "Analytics",
      "properties": {
        "analytics.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable analytics tracking"
        },
        "analytics.retentionDays": {
          "type": "number",
          "default": 30,
          "description": "Days to retain analytics data"
        }
      }
    }
  }
}
```

---

## Required Fields

### `name`

**Type:** `string`
**Pattern:** `^[a-z][a-z0-9-]*$`
**Max Length:** 214 characters

The unique identifier for your plugin. Must:
- Start with a lowercase letter
- Contain only lowercase letters, numbers, and hyphens
- Be unique across all Puffin plugins

```json
{
  "name": "my-awesome-plugin"
}
```

### `version`

**Type:** `string`
**Format:** Semantic Versioning (SemVer)

The plugin version following [Semantic Versioning](https://semver.org/).

```json
{
  "version": "1.0.0"
}
```

Valid examples:
- `"1.0.0"`
- `"2.1.0-beta.1"`
- `"1.0.0-alpha+build.123"`

### `displayName`

**Type:** `string`
**Max Length:** 50 characters

Human-readable name displayed in the Puffin UI.

```json
{
  "displayName": "Analytics Dashboard"
}
```

### `description`

**Type:** `string`
**Max Length:** 500 characters

Brief description of what the plugin does.

```json
{
  "description": "Track prompt usage and response metrics with visual dashboards"
}
```

### `main`

**Type:** `string`

Relative path to the plugin's main entry point JavaScript file.

```json
{
  "main": "src/index.js"
}
```

The entry point must export `activate()` and optionally `deactivate()` functions:

```javascript
// src/index.js
module.exports = {
  async activate(context) {
    // Plugin initialization
  },
  async deactivate() {
    // Cleanup
  }
}
```

---

## Optional Fields

### `author`

**Type:** `string` or `object`

Plugin author information.

String format:
```json
{
  "author": "Developer Name <dev@example.com>"
}
```

Object format:
```json
{
  "author": {
    "name": "Developer Name",
    "email": "dev@example.com",
    "url": "https://example.com"
  }
}
```

### `license`

**Type:** `string`

SPDX license identifier. See [SPDX License List](https://spdx.org/licenses/).

```json
{
  "license": "MIT"
}
```

Common values: `"MIT"`, `"Apache-2.0"`, `"GPL-3.0"`, `"ISC"`, `"BSD-3-Clause"`

### `repository`

**Type:** `string` (URL) or `object`

Source code repository location.

String format:
```json
{
  "repository": "https://github.com/user/my-plugin"
}
```

Object format:
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/user/my-plugin",
    "directory": "packages/my-plugin"
  }
}
```

### `homepage`

**Type:** `string` (URL)

URL to the plugin's homepage or documentation.

```json
{
  "homepage": "https://my-plugin.example.com"
}
```

### `bugs`

**Type:** `string` (URL) or `object`

Issue tracker information.

```json
{
  "bugs": "https://github.com/user/my-plugin/issues"
}
```

Or with email:
```json
{
  "bugs": {
    "url": "https://github.com/user/my-plugin/issues",
    "email": "bugs@example.com"
  }
}
```

### `keywords`

**Type:** `array` of `string`
**Max Items:** 20

Keywords for plugin discovery and categorization.

```json
{
  "keywords": ["analytics", "metrics", "dashboard", "reporting"]
}
```

### `engines`

**Type:** `object`

Runtime version requirements.

```json
{
  "engines": {
    "puffin": ">=2.0.0",
    "node": ">=18.0.0"
  }
}
```

Version range formats:
- `">=2.0.0"` - Version 2.0.0 or higher
- `"^1.5.0"` - Compatible with 1.5.0 (1.5.0 to <2.0.0)
- `"~1.5.0"` - Approximately 1.5.0 (1.5.0 to <1.6.0)
- `">=1.0.0 || >=2.0.0"` - Multiple ranges

### `dependencies`

**Type:** `object`

Other Puffin plugins this plugin depends on.

```json
{
  "dependencies": {
    "puffin-charts": "^1.0.0",
    "puffin-utils": ">=2.0.0"
  }
}
```

### `private`

**Type:** `boolean`
**Default:** `false`

If `true`, the plugin won't be published to the plugin registry.

```json
{
  "private": true
}
```

---

## Extension Points

The `extensionPoints` object declares what SAM pattern components and IPC handlers your plugin provides.

### `extensionPoints.actions`

SAM actions the plugin registers. Must be camelCase identifiers.

```json
{
  "extensionPoints": {
    "actions": ["trackPrompt", "generateReport", "clearData"]
  }
}
```

### `extensionPoints.acceptors`

SAM acceptors the plugin registers.

```json
{
  "extensionPoints": {
    "acceptors": ["analyticsAcceptor", "metricsAcceptor"]
  }
}
```

### `extensionPoints.reactors`

SAM reactors the plugin registers.

```json
{
  "extensionPoints": {
    "reactors": ["onPromptComplete", "onSessionEnd"]
  }
}
```

### `extensionPoints.components`

UI components the plugin provides. Use kebab-case identifiers.

```json
{
  "extensionPoints": {
    "components": ["analytics-dashboard", "metrics-chart"]
  }
}
```

### `extensionPoints.ipcHandlers`

IPC handlers the plugin registers. Must follow `namespace:action` format.

```json
{
  "extensionPoints": {
    "ipcHandlers": ["analytics:getData", "analytics:export", "analytics:clear"]
  }
}
```

---

## Contributions

The `contributes` object defines how your plugin extends Puffin's UI and settings.

### `contributes.commands`

Commands that can be invoked by the user.

```json
{
  "contributes": {
    "commands": [
      {
        "id": "my-plugin.doSomething",
        "title": "Do Something",
        "category": "My Plugin",
        "icon": "icon-name"
      }
    ]
  }
}
```

### `contributes.menus`

Menu contributions for various UI locations.

```json
{
  "contributes": {
    "menus": {
      "sidebar": [
        {
          "command": "my-plugin.showPanel",
          "group": "navigation"
        }
      ]
    }
  }
}
```

### `contributes.configuration`

Plugin settings schema.

```json
{
  "contributes": {
    "configuration": {
      "title": "My Plugin Settings",
      "properties": {
        "myPlugin.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable my plugin"
        },
        "myPlugin.maxItems": {
          "type": "number",
          "default": 100,
          "description": "Maximum items to display"
        },
        "myPlugin.theme": {
          "type": "string",
          "default": "auto",
          "enum": ["auto", "light", "dark"],
          "description": "Plugin color theme"
        }
      }
    }
  }
}
```

---

## Activation Events

The `activationEvents` array specifies when your plugin should be activated.

```json
{
  "activationEvents": [
    "onStartup",
    "onCommand:my-plugin.showDashboard",
    "onView:analytics"
  ]
}
```

Common activation events:
- `"onStartup"` - Activate when Puffin starts
- `"onCommand:commandId"` - Activate when a command is invoked
- `"onView:viewId"` - Activate when a view is opened

---

## Validation Errors

The manifest validator provides helpful error messages. Common issues:

### Invalid name format
```
Invalid format for "name": "My Plugin" does not match required pattern
Suggestion: Use lowercase letters, numbers, and hyphens. Must start with a letter (e.g., "my-plugin")
```

### Missing required field
```
Missing required field: "description"
Suggestion: Add the "description" field to your manifest
```

### Invalid version format
```
Invalid format for "version": "1.0" does not match required pattern
Suggestion: Use semantic versioning format: MAJOR.MINOR.PATCH (e.g., "1.0.0", "2.1.0-beta.1")
```

### Unknown field
```
Unknown field "autor" in manifest
Suggestion: Remove the "autor" field or check for typos
```

---

## Directory Structure

A typical plugin directory structure:

```
my-plugin/
├── puffin-plugin.json    # Required: Plugin manifest
├── index.js              # Main entry point (or as specified in "main")
├── src/
│   ├── actions.js        # Action definitions
│   ├── acceptors.js      # Acceptor definitions
│   └── components/       # UI components
├── package.json          # npm dependencies (optional)
├── README.md             # Documentation
└── LICENSE               # License file
```

---

## Schema Location

The JSON Schema for validation is available at:
- Local: `src/main/plugins/manifest-schema.json`
- URL: `https://puffin.dev/schemas/plugin-manifest.json`

You can use it in your editor for autocompletion:

```json
{
  "$schema": "https://puffin.dev/schemas/plugin-manifest.json",
  "name": "my-plugin",
  ...
}
```

---

## See Also

- [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md) - How to develop plugins
- [Plugin API Reference](./PLUGIN_API.md) - PluginContext API documentation
- [Plugin Architecture](./PLUGIN_ARCHITECTURE.md) - Architecture overview
