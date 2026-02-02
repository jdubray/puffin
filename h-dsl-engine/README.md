# h-DSL Bootstrap Engine

Scans an existing project and produces a populated **h-DSL schema** and **Code Model** (instance), typed by h-M3 primitives, for consumption by Puffin's Central Reasoning Engine.

## Quick Start

```bash
cd h-dsl-engine
npm install
node hdsl-bootstrap.js --project /path/to/your/project
```

## Usage

```
node hdsl-bootstrap.js --project <path> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--project <path>` | **(required)** Root directory of the target project | — |
| `--config <path>` | Path to config file | `<project>/.hdslrc.json` |
| `--exclude <patterns>` | Comma-separated glob patterns to skip | `node_modules,dist,.git,coverage` |
| `--include <patterns>` | Comma-separated glob patterns to include (e.g. `"*.js,*.ts"`) | all recognized |
| `--output <dir>` | Output directory for schema/instance JSON | `<project>/.puffin/cre` |
| `--annotate` | Generate `.an.md` annotation files for each source artifact | `false` |
| `--clean` | Delete existing schema/instance before running | `false` |
| `--verbose` | Print progress and decisions to stdout | `false` |

### Examples

**Basic scan:**
```bash
node hdsl-bootstrap.js --project C:\Users\me\my-project
```

**Clean run with annotations and verbose output:**
```bash
node hdsl-bootstrap.js --project ./my-project --clean --annotate --verbose
```

**Scan only TypeScript files, custom output dir:**
```bash
node hdsl-bootstrap.js --project ./my-project --include "*.ts,*.tsx" --output ./docs/hdsl
```

## Pipeline

The engine runs a 5-phase pipeline:

1. **DISCOVER** — Scans files, parses source with Acorn (regex fallback for JSX/TS), extracts functions, classes, exports, imports, and dependencies.
2. **DERIVE** — Builds an h-DSL schema from discovered patterns and term frequency.
3. **POPULATE** — Creates the Code Model instance: artifacts with children (functions/classes), dependencies, heuristic prose summaries, and AI-powered descriptions when available.
4. **EMIT** — Validates and writes `schema.json` and `instance.json` to the output directory.
5. **ANNOTATE** *(optional)* — Generates `.an.md` annotation files. Test/spec directories get a single aggregated `_directory.an.md` instead of per-file annotations.

## Output

All output goes to `<project>/.puffin/cre/` by default:

```
.puffin/cre/
  schema.json       # h-DSL schema with element types
  instance.json     # Code Model: artifacts, dependencies, flows
  annotations/      # (if --annotate) .an.md files per source artifact
```

## Configuration

Create a `.hdslrc.json` in your project root to set defaults:

```json
{
  "exclude": ["node_modules", "dist", ".git", "coverage", "vendor"],
  "include": ["*.js", "*.ts"],
  "verbose": true
}
```

CLI flags override config file values, which override built-in defaults.

## Global CLI Install

```bash
cd h-dsl-engine
npm link
```

Then use from anywhere:
```bash
hdsl-bootstrap --project /path/to/project --clean --verbose
```
