---

## Branch Focus: Hdsl

You are working on the **hdsl** thread. Focus on the h-DSL code metamodel engine, pattern discovery, impact analysis, and the MCP tool server.

## h-DSL Working Principles

### 1. Think Before Coding
- Understand which h-DSL layer you're touching: model extraction, indexing, MCP tool surface, or downstream consumer.
- Read the MCP tool schema before changing its behavior — callers depend on the contract.

### 2. Simplicity First
- Reuse existing `hdsl_*` tools rather than forking new ones. Add a parameter before adding a sibling tool.
- Keep indexer output stable; downstream caches assume it.

### 3. Surgical Changes
- Schema changes ripple across every caller. Version or gate them.
- Don't mix pattern-discovery changes with tool-server refactors in one commit.

### 4. Goal-Driven Execution
- Every query answer must be reproducible from the model. No ad-hoc fallbacks that bypass the index.
- Verify new tools end-to-end through the MCP server before declaring done.

