/**
 * @module discoverer
 * Phase 1: DISCOVER — scan files, parse ASTs, collect raw terms.
 *
 * Walks the project file tree, parses source files for structural
 * information, and builds frequency tables for recurring terms.
 */

'use strict';

const { glob } = require('glob');
const fs = require('fs').promises;
const path = require('path');
const { parseFile } = require('./ast-utils');

/** Source file extensions to parse with AST. */
const SOURCE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx']);

/** All file extensions to include in the file list. */
const ALL_EXTENSIONS = new Set([
  ...SOURCE_EXTENSIONS, '.json', '.html', '.css', '.scss', '.md', '.yaml', '.yml'
]);

/**
 * @typedef {Object} FileInfo
 * @property {string} relativePath - Path relative to project root.
 * @property {string} ext - File extension.
 * @property {number} size - File size in bytes.
 */

/**
 * @typedef {Object} RawArtifact
 * @property {string} path - Relative file path.
 * @property {string[]} exports - Exported symbols.
 * @property {Array<{source: string, specifiers: string[]}>} imports - Import statements.
 * @property {string[]} classes - Class declarations.
 * @property {string[]} functions - Function declarations.
 * @property {string|null} error - Parse error if any.
 */

/**
 * @typedef {Object} DiscoveryResult
 * @property {FileInfo[]} files - All discovered files.
 * @property {Map<string, number>} termFrequency - Symbol/name → occurrence count.
 * @property {Map<string, string[]>} importGraph - File → imported file paths.
 * @property {Object} dirTree - Nested directory structure.
 * @property {RawArtifact[]} rawArtifacts - Parsed source file data.
 */

/**
 * Scan the project and extract raw structural data.
 *
 * @param {Object} params
 * @param {string} params.projectRoot - Absolute project root.
 * @param {string[]} params.excludePatterns - Glob patterns to exclude.
 * @param {string[]} [params.includePatterns] - Glob patterns to include (e.g. ["*.js","*.ts"]). Empty = all recognized extensions.
 * @param {Function} params.log - Logging function.
 * @returns {Promise<DiscoveryResult>}
 */
async function discover({ projectRoot, excludePatterns, includePatterns = [], log }) {
  // Build glob ignore list
  const ignore = excludePatterns.map(p => {
    if (p.includes('/') || p.includes('*')) return p;
    return `**/${p}/**`;
  });

  // Walk file tree
  const allPaths = await glob('**/*', {
    cwd: projectRoot,
    nodir: true,
    ignore,
    posix: true
  });

  // Build include matchers from glob-like patterns (e.g. "*.js" → /\.js$/i)
  const includeMatchers = includePatterns
    .filter(Boolean)
    .map(p => {
      // Convert simple glob to anchored regex: "*.js" → /^.*\.js$/i
      const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(`^${escaped}$`, 'i');
    });

  // Filter to recognized extensions (and include patterns if specified)
  const files = [];
  for (const rel of allPaths) {
    const ext = path.extname(rel).toLowerCase();
    if (!ALL_EXTENSIONS.has(ext)) continue;
    if (includeMatchers.length > 0 && !includeMatchers.some(rx => rx.test(rel))) continue;
    let size = 0;
    try {
      const stat = await fs.stat(path.join(projectRoot, rel));
      size = stat.size;
    } catch { /* ignore stat errors */ }
    files.push({ relativePath: rel, ext, size });
  }

  // Parse source files
  const rawArtifacts = [];
  const importGraph = new Map();
  const termFrequency = new Map();

  for (const file of files) {
    if (!SOURCE_EXTENSIONS.has(file.ext)) continue;

    let content;
    try {
      content = await fs.readFile(path.join(projectRoot, file.relativePath), 'utf-8');
    } catch {
      continue;
    }

    const parsed = parseFile(content, file.relativePath);

    // Extract leading module-level JSDoc (the first /** */ block in the file)
    let moduleJsdoc = null;
    const moduleMatch = content.match(/^\s*\/\*\*([\s\S]*?)\*\//);
    if (moduleMatch) {
      const commentText = moduleMatch[1]
        .split('\n')
        .map(l => l.trim().replace(/^\*\s?/, ''))
        .filter(l => l.length > 0)
        .join('\n');
      if (commentText) moduleJsdoc = commentText;
    }

    rawArtifacts.push({
      path: file.relativePath,
      exports: parsed.exports,
      imports: parsed.imports,
      classes: parsed.classes,
      functions: parsed.functions,
      functionDetails: parsed.functionDetails || [],
      classDetails: parsed.classDetails || [],
      moduleJsdoc,
      error: parsed.error
    });

    // Build import graph: resolve relative imports to project paths
    const importedFiles = [];
    for (const imp of parsed.imports) {
      if (imp.source.startsWith('.')) {
        const resolved = resolveImportPath(file.relativePath, imp.source);
        importedFiles.push(resolved);
      }
    }
    if (importedFiles.length > 0) {
      importGraph.set(file.relativePath, importedFiles);
    }

    // Collect term frequencies
    countTerms(termFrequency, file.relativePath, parsed);
  }

  // Build directory tree
  const dirTree = buildDirTree(files.map(f => f.relativePath));

  log(`  Parsed ${rawArtifacts.length} source files`);

  return { files, termFrequency, importGraph, dirTree, rawArtifacts };
}

/**
 * Resolve a relative import path to a project-relative path.
 * @param {string} fromFile
 * @param {string} importSource
 * @returns {string}
 */
function resolveImportPath(fromFile, importSource) {
  const dir = path.posix.dirname(fromFile);
  let resolved = path.posix.join(dir, importSource);
  // Add .js if no extension
  if (!path.extname(resolved)) {
    resolved += '.js';
  }
  return resolved;
}

/**
 * Update term frequency map from a parsed file.
 * @param {Map<string, number>} freq
 * @param {string} filePath
 * @param {Object} parsed
 */
function countTerms(freq, filePath, parsed) {
  // Directory names
  const parts = filePath.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    incr(freq, `dir:${parts[i]}`);
  }

  // File naming pattern
  const basename = path.basename(filePath, path.extname(filePath));
  if (basename.includes('-')) incr(freq, 'naming:kebab-case');
  else if (/[A-Z]/.test(basename)) incr(freq, 'naming:PascalOrCamel');
  else incr(freq, 'naming:lowercase');
  if (basename === 'index') incr(freq, 'naming:index-file');

  // Naming suffix patterns
  const suffixMatch = basename.match(/[-.](\w+)$/);
  if (suffixMatch) incr(freq, `suffix:${suffixMatch[1]}`);

  // Exported symbols
  for (const exp of parsed.exports) {
    incr(freq, `export:${exp}`);
  }

  // Import sources (external modules)
  for (const imp of parsed.imports) {
    if (!imp.source.startsWith('.')) {
      incr(freq, `pkg:${imp.source}`);
    }
  }

  // Class names
  for (const cls of parsed.classes) {
    incr(freq, `class:${cls}`);
    // Extract suffix pattern (e.g. FooManager → Manager)
    const classSuffix = cls.match(/[a-z]([A-Z]\w+)$/);
    if (classSuffix) incr(freq, `classSuffix:${classSuffix[1]}`);
  }
}

/** @param {Map<string, number>} map @param {string} key */
function incr(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

/**
 * Build a nested directory tree from file paths.
 * @param {string[]} paths
 * @returns {Object}
 */
function buildDirTree(paths) {
  const tree = {};
  for (const p of paths) {
    const parts = p.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = null; // leaf = file
  }
  return tree;
}

module.exports = { discover };
