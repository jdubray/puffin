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
 * @typedef {Object} FunctionDetail
 * @property {string} name - Function name.
 * @property {string[]} params - Parameter names.
 * @property {boolean} async - Whether the function is async.
 * @property {number} line - Start line number (1-based).
 * @property {number} endLine - End line number (1-based).
 * @property {string|null} jsdoc - Leading JSDoc comment text, if any.
 */

/**
 * @typedef {Object} ClassDetail
 * @property {string} name - Class name.
 * @property {string|null} superClass - Name of the extended class, if any.
 * @property {number} line - Start line number (1-based).
 * @property {number} endLine - End line number (1-based).
 * @property {string|null} jsdoc - Leading JSDoc comment text, if any.
 * @property {FunctionDetail[]} methods - Class method details.
 */

/**
 * Parse a JS file and extract structural information.
 *
 * @param {string} content - File source content.
 * @param {string} filePath - File path (for error messages).
 * @returns {{ exports: string[], imports: Array<{source: string, specifiers: string[]}>, classes: string[], functions: string[], functionDetails: FunctionDetail[], classDetails: ClassDetail[], error: string|null }}
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
    allowReturnOutsideFunction: true,
    locations: true,
    onComment: []
  });

  // Collect comments for JSDoc association
  const comments = ast.onComment || [];
  // Also extract JSDoc via regex as fallback (acorn onComment needs config)
  const jsdocMap = buildJSDocMap(content);

  const exports = [];
  const imports = [];
  const classes = [];
  const functions = [];
  const functionDetails = [];
  const classDetails = [];

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
          classDetails.push(extractClassDetail(node.declaration, jsdocMap));
        }
        if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
          functions.push(node.declaration.id.name);
          functionDetails.push(extractFunctionDetail(node.declaration, jsdocMap));
        }
        if (node.declaration.type === 'VariableDeclaration') {
          for (const decl of node.declaration.declarations) {
            if (decl.id && decl.id.name && decl.init &&
                (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression')) {
              functionDetails.push(extractVarFunctionDetail(decl, jsdocMap));
            }
          }
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
      if (node.declaration) {
        if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
          functionDetails.push(extractFunctionDetail(node.declaration, jsdocMap));
        }
        if (node.declaration.type === 'ClassDeclaration' && node.declaration.id) {
          classDetails.push(extractClassDetail(node.declaration, jsdocMap));
        }
      }
    }

    // Class declarations (non-exported)
    if (node.type === 'ClassDeclaration' && node.id) {
      classes.push(node.id.name);
      classDetails.push(extractClassDetail(node, jsdocMap));
    }

    // Function declarations (non-exported)
    if (node.type === 'FunctionDeclaration' && node.id) {
      functions.push(node.id.name);
      functionDetails.push(extractFunctionDetail(node, jsdocMap));
    }

    // Variable declarations (for arrow functions, CommonJS requires, module.exports)
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (!decl.init) continue;

        // Extract the require() call, handling both:
        //   const x = require('...')
        //   const x = require('...').property
        //   const { a, b } = require('...')
        const requireCall = extractRequireCall(decl.init);
        if (requireCall) {
          const specifiers = decl.id.type === 'ObjectPattern'
            ? decl.id.properties.map(p => (p.value || p.key).name).filter(Boolean)
            : decl.id.name ? [decl.id.name] : [];
          if (specifiers.length > 0) {
            imports.push({ source: requireCall, specifiers });
          }
        }

        // const x = () => {} or const x = function() {}
        if (decl.id && decl.id.name &&
            (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression')) {
          functions.push(decl.id.name);
          functionDetails.push(extractVarFunctionDetail(decl, jsdocMap));
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

  // Deduplicate functionDetails and classDetails by name+line
  const seenFns = new Set();
  const dedupedFunctions = functionDetails.filter(f => {
    const key = `${f.name}:${f.line}`;
    if (seenFns.has(key)) return false;
    seenFns.add(key);
    return true;
  });
  const seenClasses = new Set();
  const dedupedClasses = classDetails.filter(c => {
    const key = `${c.name}:${c.line}`;
    if (seenClasses.has(key)) return false;
    seenClasses.add(key);
    return true;
  });

  return { exports, imports, classes, functions, functionDetails: dedupedFunctions, classDetails: dedupedClasses, error: null };
}

/**
 * Build a map of line numbers to their preceding JSDoc comment text.
 * @param {string} content
 * @returns {Map<number, string>} Map from line number to JSDoc text.
 */
function buildJSDocMap(content) {
  const map = new Map();
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('/**')) {
      const commentLines = [];
      let j = i;
      while (j < lines.length) {
        commentLines.push(lines[j]);
        if (lines[j].includes('*/')) break;
        j++;
      }
      const commentText = commentLines
        .map(l => l.trim().replace(/^\/\*\*\s?/, '').replace(/^\*\/\s?$/, '').replace(/^\*\s?/, ''))
        .filter(l => l.length > 0)
        .join('\n');
      // The declaration following the JSDoc is at line j+1 (0-based), so j+2 (1-based)
      const declLine = j + 2;
      if (commentText) {
        map.set(declLine, commentText);
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return map;
}

/**
 * Extract parameter names from AST function params.
 * @param {Array} params - AST param nodes.
 * @returns {string[]}
 */
function extractParamNames(params) {
  return params.map(p => {
    if (p.type === 'Identifier') return p.name;
    if (p.type === 'AssignmentPattern' && p.left && p.left.name) return p.left.name;
    if (p.type === 'RestElement' && p.argument && p.argument.name) return `...${p.argument.name}`;
    if (p.type === 'ObjectPattern') return '{...}';
    if (p.type === 'ArrayPattern') return '[...]';
    return '?';
  });
}

/**
 * Extract rich detail from a FunctionDeclaration AST node.
 * @param {Object} node
 * @param {Map<number, string>} jsdocMap
 * @returns {FunctionDetail}
 */
function extractFunctionDetail(node, jsdocMap) {
  const line = node.loc ? node.loc.start.line : 0;
  const endLine = node.loc ? node.loc.end.line : 0;
  return {
    name: node.id ? node.id.name : '(anonymous)',
    params: extractParamNames(node.params || []),
    async: !!node.async,
    line,
    endLine,
    jsdoc: jsdocMap.get(line) || null
  };
}

/**
 * Extract rich detail from a variable-assigned function (arrow or expression).
 * @param {Object} decl - VariableDeclarator node.
 * @param {Map<number, string>} jsdocMap
 * @returns {FunctionDetail}
 */
function extractVarFunctionDetail(decl, jsdocMap) {
  const fnNode = decl.init;
  const line = decl.id && decl.id.loc ? decl.id.loc.start.line : 0;
  const endLine = fnNode && fnNode.loc ? fnNode.loc.end.line : line;
  return {
    name: decl.id ? decl.id.name : '(anonymous)',
    params: extractParamNames(fnNode.params || []),
    async: !!(fnNode && fnNode.async),
    line,
    endLine,
    jsdoc: jsdocMap.get(line) || null
  };
}

/**
 * Extract rich detail from a ClassDeclaration AST node.
 * @param {Object} node
 * @param {Map<number, string>} jsdocMap
 * @returns {ClassDetail}
 */
function extractClassDetail(node, jsdocMap) {
  const line = node.loc ? node.loc.start.line : 0;
  const endLine = node.loc ? node.loc.end.line : 0;
  const methods = [];

  if (node.body && node.body.body) {
    for (const member of node.body.body) {
      if (member.type === 'MethodDefinition' && member.key) {
        const mLine = member.loc ? member.loc.start.line : 0;
        const mEndLine = member.loc ? member.loc.end.line : 0;
        methods.push({
          name: member.key.name || member.key.value || '(computed)',
          params: extractParamNames(member.value ? member.value.params || [] : []),
          async: !!(member.value && member.value.async),
          line: mLine,
          endLine: mEndLine,
          jsdoc: jsdocMap.get(mLine) || null,
          kind: member.kind || 'method'
        });
      }
    }
  }

  return {
    name: node.id ? node.id.name : '(anonymous)',
    superClass: node.superClass ? (node.superClass.name || '(expression)') : null,
    line,
    endLine,
    jsdoc: jsdocMap.get(line) || null,
    methods
  };
}

/**
 * Extract the module source from a require() call, handling member access.
 * Matches: require('x'), require('x').foo, require('x').foo.bar
 * @param {Object} initNode - The init AST node of a VariableDeclarator.
 * @returns {string|null} The module source string, or null if not a require.
 */
function extractRequireCall(initNode) {
  // Direct: require('x')
  if (initNode.type === 'CallExpression' &&
      initNode.callee && initNode.callee.name === 'require' &&
      initNode.arguments[0] && initNode.arguments[0].type === 'Literal') {
    return initNode.arguments[0].value;
  }
  // Member: require('x').property
  if (initNode.type === 'MemberExpression' && initNode.object) {
    return extractRequireCall(initNode.object);
  }
  return null;
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
  const functionDetails = [];
  const classDetails = [];
  const lines = content.split('\n');
  const jsdocMap = buildJSDocMap(content);

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

  // Classes with detail
  for (const m of content.matchAll(/class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g)) {
    classes.push(m[1]);
    const lineNum = content.slice(0, m.index).split('\n').length;
    classDetails.push({
      name: m[1],
      superClass: m[2] || null,
      line: lineNum,
      endLine: lineNum,
      jsdoc: jsdocMap.get(lineNum) || null,
      methods: []
    });
  }

  // Functions with detail
  for (const m of content.matchAll(/(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)) {
    const name = m[2];
    functions.push(name);
    const lineNum = content.slice(0, m.index).split('\n').length;
    functionDetails.push({
      name,
      params: m[3] ? m[3].split(',').map(p => p.trim()).filter(Boolean) : [],
      async: !!m[1],
      line: lineNum,
      endLine: lineNum,
      jsdoc: jsdocMap.get(lineNum) || null
    });
  }

  // Arrow functions assigned to const/let with detail
  for (const m of content.matchAll(/(const|let)\s+(\w+)\s*=\s*(async\s+)?(\(([^)]*)\)|\w+)\s*=>/g)) {
    const name = m[2];
    functions.push(name);
    const lineNum = content.slice(0, m.index).split('\n').length;
    functionDetails.push({
      name,
      params: m[5] ? m[5].split(',').map(p => p.trim()).filter(Boolean) : [],
      async: !!m[3],
      line: lineNum,
      endLine: lineNum,
      jsdoc: jsdocMap.get(lineNum) || null
    });
  }

  return { exports, imports, classes, functions, functionDetails, classDetails, error: 'acorn parse failed, used regex fallback' };
}

module.exports = { parseFile };
