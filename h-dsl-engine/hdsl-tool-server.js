#!/usr/bin/env node
'use strict';

/**
 * h-DSL MCP Tool Server
 *
 * Exposes the h-DSL code model as an MCP (Model Context Protocol) tool server
 * over stdio. Claude Code discovers this via .mcp.json and invokes tools
 * during planning, RIS generation, and ad-hoc exploration.
 *
 * Transport: JSON-RPC 2.0 over stdin/stdout (one message per line).
 *
 * Usage:
 *   node hdsl-tool-server.js --project /path/to/project [--output /path/to/cre]
 */

const path = require('path');
const readline = require('readline');

// Parse CLI args for project root and data dir (only when running directly)
let projectRoot = null;
let dataDir = null;

const isDirectRun = require.main === module;

if (isDirectRun) {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      projectRoot = path.resolve(args[++i]);
    } else if (args[i] === '--output' && args[i + 1]) {
      dataDir = path.resolve(args[++i]);
    }
  }

  if (!projectRoot) {
    process.stderr.write('Error: --project <path> is required\n');
    process.exit(1);
  }

  if (!dataDir) {
    dataDir = path.join(projectRoot, '.puffin', 'cre');
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'hdsl_stats',
    description: 'Get codebase statistics from the h-DSL Code Model — artifact counts, dependency counts, type breakdowns.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'hdsl_peek',
    description: 'Get a summary of a code artifact (module, function, class) by path. Returns type, kind, summary, exports, tags, and size.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Artifact path (e.g. src/main/plugin-loader.js)' }
      },
      required: ['path']
    }
  },
  {
    name: 'hdsl_search',
    description: 'Search the Code Model by free-text (mode "text") or structured filter (mode "artifact"). Auto-detects mode from provided fields if omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern or search text' },
        mode: { type: 'string', enum: ['text', 'artifact'], description: 'Search mode: "text" for free-text, "artifact" for structured filter. Auto-detected if omitted.' },
        elementType: { type: 'string', description: 'Filter by element type (module, component, service, etc.)' },
        kind: { type: 'string', description: 'Filter by artifact kind' },
        limit: { type: 'number', description: 'Max results (default 20)', default: 20 }
      }
    }
  },
  {
    name: 'hdsl_deps',
    description: 'List dependencies for an artifact — who it depends on (outgoing) and who depends on it (incoming). Grouped by relationship type.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Artifact path' },
        direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'], default: 'both' }
      },
      required: ['path']
    }
  },
  {
    name: 'hdsl_trace',
    description: 'Follow dependency chains from a starting artifact. BFS traversal filtered by relationship type and direction.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Starting artifact path' },
        direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'], default: 'outgoing' },
        kind: { type: 'string', description: 'Relationship type to follow (import, call, etc.). Omit for all.' },
        depth: { type: 'number', description: 'Max traversal depth (default 2)', default: 2 }
      },
      required: ['path']
    }
  },
  {
    name: 'hdsl_impact',
    description: 'Analyze the impact of changing a target entity. Returns affected files, risk scores, and transitive dependency chains.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Entity path or glob pattern to analyze' },
        depth: { type: 'number', description: 'Max analysis depth (default 3)', default: 3 }
      },
      required: ['target']
    }
  },
  {
    name: 'hdsl_patterns',
    description: 'Discover codebase patterns and conventions — naming, file organization, module structure, architecture. Can find similar implementations.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['naming', 'organization', 'modules', 'architecture', 'similar', 'all'], default: 'all' },
        area: { type: 'string', description: 'Path pattern to scope analysis' },
        featureType: { type: 'string', description: 'Feature type to find examples of (for similar category)' }
      }
    }
  },
  {
    name: 'hdsl_path',
    description: 'Find the shortest path between two entities in the dependency graph. Shows how they are connected.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source entity path' },
        to: { type: 'string', description: 'Target entity path' }
      },
      required: ['from', 'to']
    }
  },
  {
    name: 'hdsl_freshness',
    description: 'Check if the Code Model is up-to-date relative to git history. Reports stale files and can trigger incremental update.',
    inputSchema: {
      type: 'object',
      properties: {
        autoUpdate: { type: 'boolean', description: 'Automatically update if stale', default: false }
      }
    }
  }
];

// ---------------------------------------------------------------------------
// Lazy-loaded modules
// ---------------------------------------------------------------------------

let _model = null;

async function getModel() {
  if (_model) return _model;
  const { loadModel } = require('./lib/explorer');
  _model = await loadModel(dataDir);
  return _model;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleToolCall(name, args) {
  const model = await getModel();
  const { schema, instance } = model;

  switch (name) {
    case 'hdsl_stats': {
      const { executeQuery } = require('./lib/explorer');
      return executeQuery({ schema, instance, query: { type: 'stats' } });
    }

    case 'hdsl_peek': {
      const art = instance.artifacts[args.path];
      if (!art) {
        return { error: `Artifact not found: ${args.path}` };
      }
      return {
        path: args.path,
        type: art.type,
        kind: art.kind || null,
        summary: art.summary || null,
        intent: art.intent || null,
        exports: art.exports || [],
        tags: art.tags || [],
        size: art.size || null,
        children: art.children || undefined
      };
    }

    case 'hdsl_search': {
      const { executeQuery } = require('./lib/explorer');
      // Determine search mode: explicit > auto-detect
      const mode = args.mode
        || (args.elementType || args.kind ? 'artifact' : 'text');
      if (mode === 'text' && args.pattern) {
        return executeQuery({ schema, instance, query: { type: 'search', pattern: args.pattern, limit: args.limit || 20 } });
      }
      return executeQuery({ schema, instance, query: {
        type: 'artifact',
        pattern: args.pattern || undefined,
        elementType: args.elementType || undefined,
        kind: args.kind || undefined,
        limit: args.limit || 20
      }});
    }

    case 'hdsl_deps': {
      const { getEntityNeighbors } = require('./lib/graph-navigator');
      return getEntityNeighbors({ instance, options: {
        entity: args.path,
        direction: args.direction || 'both'
      }});
    }

    case 'hdsl_trace': {
      const { walk } = require('./lib/graph-navigator');
      return walk({ instance, options: {
        start: args.path,
        direction: args.direction || 'outgoing',
        relationshipTypes: args.kind ? [args.kind] : undefined,
        maxDepth: args.depth || 2
      }});
    }

    case 'hdsl_impact': {
      const { analyzeImpact } = require('./lib/impact-analyzer');
      return analyzeImpact({ schema, instance, target: {
        name: args.target,
        depth: args.depth || 3
      }});
    }

    case 'hdsl_patterns': {
      const { discoverPatterns } = require('./lib/pattern-discovery');
      return discoverPatterns({ schema, instance, query: {
        category: args.category || 'all',
        area: args.area || undefined,
        featureType: args.featureType || undefined
      }});
    }

    case 'hdsl_path': {
      const { findPath } = require('./lib/graph-navigator');
      return findPath({ instance, options: {
        from: args.from,
        to: args.to,
        maxDepth: 10
      }});
    }

    case 'hdsl_freshness': {
      const { ensureFresh } = require('./lib/freshness');
      const result = await ensureFresh({
        projectRoot,
        dataDir,
        autoUpdate: args.autoUpdate || false
      });
      // Invalidate cached model if an update was performed
      if (result.action === 'incremental-update') {
        _model = null;
      }
      return result;
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 message handling
// ---------------------------------------------------------------------------

function makeResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function makeError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(msg) {
  let parsed;
  try {
    parsed = JSON.parse(msg);
  } catch {
    return makeError(null, -32700, 'Parse error');
  }

  const { id, method, params } = parsed;

  switch (method) {
    case 'initialize':
      return makeResponse(id, {
        serverInfo: { name: 'hdsl', version: '0.1.0' },
        capabilities: { tools: {} }
      });

    case 'initialized':
      // Notification — no response needed
      return null;

    case 'tools/list':
      return makeResponse(id, { tools: TOOLS });

    case 'tools/call': {
      const { name, arguments: toolArgs } = params || {};
      if (!name) {
        return makeError(id, -32602, 'Missing tool name');
      }
      const knownTool = TOOLS.find(t => t.name === name);
      if (!knownTool) {
        return makeError(id, -32602, `Unknown tool: ${name}`);
      }
      try {
        const result = await handleToolCall(name, toolArgs || {});
        return makeResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        });
      } catch (err) {
        return makeResponse(id, {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true
        });
      }
    }

    default:
      return makeError(id, -32601, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Stdio transport
// ---------------------------------------------------------------------------

if (isDirectRun) {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    const response = await handleMessage(line);
    if (response !== null) {
      process.stdout.write(response + '\n');
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

// Export for testing
function _setModelForTesting(model) { _model = model; }
module.exports = { TOOLS, handleToolCall, handleMessage, _setModelForTesting };
