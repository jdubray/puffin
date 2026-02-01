/**
 * @module ast-utils
 * AST parsing helpers for extracting exports, imports, classes, and functions.
 *
 * Uses acorn for JS parsing with graceful fallback to regex for files
 * that fail AST parsing (e.g., JSX, TS without transpile).
 */

'use strict';

const acorn = require('acorn');

/**
 * Parse a JS file and extract structural information.
 *
 * @param {string} content - File source content.
 * @param {string} filePath - File path (for error messages).
 * @returns {{ exports: string[], imports: Array<{source: string, specifiers: string[]}>, classes: string[], functions: string[], error: string|null }}
 */
function parseFile(content, filePath) {
  try {
    return parseWithAcorn(content);
  } catch {
    // Fallback to regex-based extraction for files acorn can't handle
    return parseWithRegex(content);
  }
}

/**
 * Parse using acorn AST.
 * @param {string} content
 * @returns {Object}
 */
function parseWithAcorn(content) {
  const ast = acorn.parse(content, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true
  });

  const exports = [];
  const imports = [];
  const classes = [];
  const functions = [];

  for (const node of ast.body) {
    // Imports
    if (node.type === 'ImportDeclaration' && node.source) {
      imports.push({
        source: node.source.value,
        specifiers: node.specifiers.map(s => s.local.name)
      });
    }

    // Export named
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        const names = extractDeclarationNames(node.declaration);
        exports.push(...names);
        if (node.declaration.type === 'ClassDeclaration' && node.declaration.id) {
          classes.push(node.declaration.id.name);
        }
        if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
          functions.push(node.declaration.id.name);
        }
      }
      if (node.specifiers) {
        exports.push(...node.specifiers.map(s => (s.exported || s.local).name));
      }
    }

    // Export default
    if (node.type === 'ExportDefaultDeclaration') {
      if (node.declaration && node.declaration.id) {
        exports.push(node.declaration.id.name);
      } else {
        exports.push('default');
      }
    }

    // Class declarations
    if (node.type === 'ClassDeclaration' && node.id) {
      classes.push(node.id.name);
    }

    // Function declarations
    if (node.type === 'FunctionDeclaration' && node.id) {
      functions.push(node.id.name);
    }

    // Variable declarations (for arrow functions, CommonJS requires, module.exports)
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.id && decl.id.name && decl.init) {
          // const x = require('...')
          if (decl.init.type === 'CallExpression' &&
              decl.init.callee && decl.init.callee.name === 'require' &&
              decl.init.arguments[0] && decl.init.arguments[0].type === 'Literal') {
            imports.push({
              source: decl.init.arguments[0].value,
              specifiers: [decl.id.name]
            });
          }
          // const x = () => {} or const x = function() {}
          if (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression') {
            functions.push(decl.id.name);
          }
        }
      }
    }

    // module.exports = ...
    if (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression') {
      const left = node.expression.left;
      if (left.type === 'MemberExpression' &&
          left.object && left.object.name === 'module' &&
          left.property && left.property.name === 'exports') {
        const right = node.expression.right;
        if (right.type === 'ObjectExpression') {
          for (const prop of right.properties) {
            if (prop.key && (prop.key.name || prop.key.value)) {
              exports.push(prop.key.name || prop.key.value);
            }
          }
        } else if (right.type === 'Identifier') {
          exports.push(right.name);
        }
      }
      // exports.x = ...
      if (left.type === 'MemberExpression' &&
          left.object && left.object.name === 'exports' &&
          left.property) {
        exports.push(left.property.name || left.property.value);
      }
    }
  }

  return { exports, imports, classes, functions, error: null };
}

/**
 * Extract declaration names from an AST node.
 * @param {Object} decl
 * @returns {string[]}
 */
function extractDeclarationNames(decl) {
  if (decl.id) return [decl.id.name];
  if (decl.type === 'VariableDeclaration') {
    return decl.declarations
      .filter(d => d.id && d.id.name)
      .map(d => d.id.name);
  }
  return [];
}

/**
 * Regex-based fallback parser for files that acorn can't handle.
 * @param {string} content
 * @returns {Object}
 */
function parseWithRegex(content) {
  const exports = [];
  const imports = [];
  const classes = [];
  const functions = [];

  // CommonJS require
  for (const m of content.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g)) {
    imports.push({ source: m[2], specifiers: [m[1]] });
  }

  // ES imports
  for (const m of content.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g)) {
    const specifiers = m[1]
      ? m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
      : [m[2]];
    imports.push({ source: m[3], specifiers });
  }

  // module.exports = { a, b }
  const moduleExports = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  if (moduleExports) {
    moduleExports[1].split(',').forEach(s => {
      const name = s.trim().split(/[:\s]/)[0].trim();
      if (name) exports.push(name);
    });
  }

  // module.exports = Name
  const singleExport = content.match(/module\.exports\s*=\s*(\w+)/);
  if (singleExport && !moduleExports) {
    exports.push(singleExport[1]);
  }

  // exports.name = ...
  for (const m of content.matchAll(/exports\.(\w+)\s*=/g)) {
    exports.push(m[1]);
  }

  // export function/class/const
  for (const m of content.matchAll(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g)) {
    exports.push(m[1]);
  }

  // Classes
  for (const m of content.matchAll(/class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g)) {
    classes.push(m[1]);
  }

  // Functions
  for (const m of content.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)) {
    functions.push(m[1]);
  }

  // Arrow functions assigned to const/let
  for (const m of content.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>/g)) {
    functions.push(m[1]);
  }

  return { exports, imports, classes, functions, error: 'acorn parse failed, used regex fallback' };
}

module.exports = { parseFile };
