/**
 * @module pattern-discovery
 * Discovers patterns and conventions in the codebase by analyzing the
 * h-DSL code model (schema + instance).
 *
 * Pattern categories:
 *   naming      — file/export naming conventions (camelCase, PascalCase, kebab, etc.)
 *   organization — directory structure and file grouping patterns
 *   modules     — module structure patterns (barrel files, index re-exports, etc.)
 *   architecture — layering and architectural style detection
 *   similar     — find examples similar to a given feature type or query
 */

'use strict';

const { patternToRegex } = require('./explorer');

// ---------------------------------------------------------------------------
// Naming convention detectors
// ---------------------------------------------------------------------------

const NAMING_PATTERNS = {
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
  snake_case: /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/,
  'kebab-case': /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/,
  UPPER_SNAKE: /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/
};

/**
 * Detect the naming convention of a symbol.
 * @param {string} name
 * @returns {string} Convention name or 'other'.
 */
function detectNamingConvention(name) {
  for (const [convention, re] of Object.entries(NAMING_PATTERNS)) {
    if (re.test(name)) return convention;
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Discover patterns and conventions in the codebase.
 *
 * @param {Object} params
 * @param {Object} params.schema
 * @param {Object} params.instance
 * @param {Object} [params.query] - Optional filter/focus.
 * @param {string} [params.query.category] - One of: naming, organization, modules, architecture, similar, all.
 * @param {string} [params.query.area] - Path pattern to focus analysis on a specific area.
 * @param {string} [params.query.featureType] - For 'similar' queries — find examples of this type.
 * @returns {Object} Pattern discovery report.
 */
function discoverPatterns({ schema, instance, query = {} }) {
  const { category = 'all', area, featureType } = query;

  // Optionally scope to a specific area
  let artifacts = Object.entries(instance.artifacts);
  if (area) {
    const re = patternToRegex(area);
    artifacts = artifacts.filter(([p]) => re.test(p));
  }

  const report = {
    reportType: 'pattern-discovery',
    area: area || '*',
    artifactCount: artifacts.length
  };

  if (category === 'all' || category === 'naming') {
    report.naming = analyzeNaming(artifacts);
  }
  if (category === 'all' || category === 'organization') {
    report.organization = analyzeOrganization(artifacts);
  }
  if (category === 'all' || category === 'modules') {
    report.modules = analyzeModuleStructure(artifacts, instance);
  }
  if (category === 'all' || category === 'architecture') {
    report.architecture = analyzeArchitecture(artifacts, instance, schema);
  }
  if (category === 'similar') {
    if (!featureType) {
      throw new Error('similar query requires a "featureType" field');
    }
    report.similar = findSimilarImplementations(artifacts, instance, featureType);
  }

  return report;
}

// ---------------------------------------------------------------------------
// Naming analysis
// ---------------------------------------------------------------------------

/**
 * Analyze naming conventions across file names and exported symbols.
 */
function analyzeNaming(artifacts) {
  const fileNameConventions = {};
  const exportConventions = {};
  const fileExamples = {};
  const exportExamples = {};

  for (const [artPath, art] of artifacts) {
    // File name (without extension)
    const baseName = artPath.split('/').pop().replace(/\.[^.]+$/, '');
    const fileConv = detectNamingConvention(baseName);
    fileNameConventions[fileConv] = (fileNameConventions[fileConv] || 0) + 1;
    if (!fileExamples[fileConv]) fileExamples[fileConv] = [];
    if (fileExamples[fileConv].length < 3) fileExamples[fileConv].push(artPath);

    // Exports
    for (const exp of (art.exports || [])) {
      const expConv = detectNamingConvention(exp);
      exportConventions[expConv] = (exportConventions[expConv] || 0) + 1;
      if (!exportExamples[expConv]) exportExamples[expConv] = [];
      if (exportExamples[expConv].length < 3) {
        exportExamples[expConv].push({ symbol: exp, file: artPath });
      }
    }
  }

  // Determine dominant conventions
  const dominantFileConvention = findDominant(fileNameConventions);
  const dominantExportConvention = findDominant(exportConventions);

  return {
    fileNames: {
      dominant: dominantFileConvention,
      distribution: fileNameConventions,
      examples: fileExamples
    },
    exports: {
      dominant: dominantExportConvention,
      distribution: exportConventions,
      examples: exportExamples
    }
  };
}

// ---------------------------------------------------------------------------
// Organization analysis
// ---------------------------------------------------------------------------

/**
 * Analyze directory structure and file grouping patterns.
 */
function analyzeOrganization(artifacts) {
  // Group by top-level directory
  const dirGroups = {};
  const dirTypeCounts = {};

  for (const [artPath, art] of artifacts) {
    const parts = artPath.split('/');
    const topDir = parts.length > 1 ? parts[0] : '.';
    if (!dirGroups[topDir]) dirGroups[topDir] = [];
    dirGroups[topDir].push({ path: artPath, type: art.type, kind: art.kind });

    // Track what types live in each directory
    const key = `${topDir}:${art.type}`;
    dirTypeCounts[key] = (dirTypeCounts[key] || 0) + 1;
  }

  // Detect grouping style: by-type, by-feature, or mixed
  const dirPurposes = {};
  for (const [dir, files] of Object.entries(dirGroups)) {
    const types = new Set(files.map(f => f.type));
    const kinds = new Set(files.map(f => f.kind).filter(Boolean));
    dirPurposes[dir] = {
      fileCount: files.length,
      types: [...types],
      kinds: [...kinds],
      style: types.size === 1 ? 'type-grouped' : (types.size <= 2 ? 'cohesive' : 'mixed')
    };
  }

  // Extension distribution
  const extCounts = {};
  for (const [artPath] of artifacts) {
    const ext = artPath.match(/\.[^.]+$/)?.[0] || 'none';
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }

  // Detect overall organization style
  const styles = Object.values(dirPurposes).map(d => d.style);
  const typeGrouped = styles.filter(s => s === 'type-grouped').length;
  const overallStyle = typeGrouped > styles.length * 0.6
    ? 'group-by-type'
    : typeGrouped < styles.length * 0.3
      ? 'group-by-feature'
      : 'hybrid';

  return {
    overallStyle,
    directories: dirPurposes,
    extensionDistribution: extCounts,
    topLevelDirectoryCount: Object.keys(dirGroups).length
  };
}

// ---------------------------------------------------------------------------
// Module structure analysis
// ---------------------------------------------------------------------------

/**
 * Analyze module structure patterns (barrel files, re-exports, etc.).
 */
function analyzeModuleStructure(artifacts, instance) {
  const patterns = [];
  const barrelFiles = [];
  const entryPoints = [];
  const highExportModules = [];

  for (const [artPath, art] of artifacts) {
    const baseName = artPath.split('/').pop();

    // Barrel / index files
    if (/^index\.[jt]sx?$/.test(baseName)) {
      barrelFiles.push({
        path: artPath,
        exportCount: (art.exports || []).length,
        type: art.type
      });
    }

    // Entry points
    if (art.kind === 'entry') {
      entryPoints.push({ path: artPath, exports: art.exports || [] });
    }

    // High-export modules (potential god modules)
    const exportCount = (art.exports || []).length;
    if (exportCount >= 5) {
      highExportModules.push({
        path: artPath,
        exportCount,
        exports: art.exports
      });
    }
  }

  // Detect dependency patterns
  const depKinds = {};
  for (const dep of instance.dependencies) {
    depKinds[dep.kind] = (depKinds[dep.kind] || 0) + 1;
  }

  // Identify modules that are depended on by many others (shared utilities)
  const importCounts = {};
  for (const dep of instance.dependencies) {
    importCounts[dep.to] = (importCounts[dep.to] || 0) + 1;
  }

  const sharedUtilities = Object.entries(importCounts)
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([artPath, count]) => ({
      path: artPath,
      importedBy: count,
      type: instance.artifacts[artPath]?.type || null,
      summary: instance.artifacts[artPath]?.summary || null
    }));

  // Detect common patterns
  if (barrelFiles.length > 0) {
    patterns.push({
      name: 'barrel-exports',
      description: 'Index files re-export module contents for cleaner imports',
      occurrences: barrelFiles.length,
      examples: barrelFiles.slice(0, 3).map(b => b.path)
    });
  }

  if (sharedUtilities.length > 0) {
    patterns.push({
      name: 'shared-utilities',
      description: 'Common modules imported by many other modules',
      occurrences: sharedUtilities.length,
      examples: sharedUtilities.slice(0, 3).map(s => s.path)
    });
  }

  if (highExportModules.length > 0) {
    patterns.push({
      name: 'high-export-modules',
      description: 'Modules with many exported symbols (potential API surfaces)',
      occurrences: highExportModules.length,
      examples: highExportModules.slice(0, 3).map(m => m.path)
    });
  }

  return {
    patterns,
    barrelFiles,
    entryPoints,
    sharedUtilities,
    dependencyKindDistribution: depKinds
  };
}

// ---------------------------------------------------------------------------
// Architecture analysis
// ---------------------------------------------------------------------------

/**
 * Detect architectural style and layering.
 */
function analyzeArchitecture(artifacts, instance, schema) {
  // Identify layers based on directory names and artifact types
  const layerKeywords = {
    presentation: ['component', 'view', 'page', 'screen', 'ui', 'renderer', 'template'],
    domain: ['model', 'entity', 'domain', 'core', 'type', 'schema'],
    service: ['service', 'api', 'client', 'provider', 'adapter', 'gateway'],
    infrastructure: ['config', 'util', 'helper', 'lib', 'shared', 'common'],
    data: ['store', 'state', 'reducer', 'repository', 'db', 'database', 'migration'],
    testing: ['test', 'spec', 'mock', 'fixture', '__test__', '__tests__']
  };

  const layers = {};
  const layerArtifacts = {};

  for (const [artPath, art] of artifacts) {
    const assignedLayer = classifyLayer(artPath, art, layerKeywords);

    if (!layers[assignedLayer]) layers[assignedLayer] = 0;
    layers[assignedLayer]++;

    if (!layerArtifacts[assignedLayer]) layerArtifacts[assignedLayer] = [];
    if (layerArtifacts[assignedLayer].length < 5) {
      layerArtifacts[assignedLayer].push({
        path: artPath,
        type: art.type,
        kind: art.kind || null
      });
    }
  }

  // Detect cross-layer dependencies
  const crossLayerDeps = [];
  const layerLookup = buildLayerLookup(artifacts, layerKeywords);

  for (const dep of instance.dependencies) {
    const fromLayer = layerLookup.get(dep.from);
    const toLayer = layerLookup.get(dep.to);
    if (fromLayer && toLayer && fromLayer !== toLayer) {
      crossLayerDeps.push({
        from: dep.from,
        to: dep.to,
        fromLayer,
        toLayer,
        kind: dep.kind
      });
    }
  }

  // Summarize cross-layer flows
  const crossLayerSummary = {};
  for (const d of crossLayerDeps) {
    const key = `${d.fromLayer} → ${d.toLayer}`;
    crossLayerSummary[key] = (crossLayerSummary[key] || 0) + 1;
  }

  // Detect architectural style
  const detectedLayers = Object.keys(layers).filter(l => l !== 'unclassified');
  let style = 'flat';
  if (detectedLayers.length >= 4) style = 'layered';
  else if (detectedLayers.length >= 2) style = 'modular';

  const hasPresentation = layers.presentation > 0;
  const hasDomain = layers.domain > 0;
  const hasService = layers.service > 0;
  if (hasPresentation && hasService && hasDomain) style = 'layered (MVC-like)';
  else if (hasPresentation && hasService) style = 'layered (service-based)';

  // Element type usage from schema
  const typeUsage = {};
  for (const [, art] of artifacts) {
    typeUsage[art.type] = (typeUsage[art.type] || 0) + 1;
  }

  return {
    style,
    layers,
    layerExamples: layerArtifacts,
    crossLayerDependencies: crossLayerSummary,
    crossLayerEdgeCount: crossLayerDeps.length,
    elementTypeUsage: typeUsage,
    schemaElementTypes: Object.keys(schema.elementTypes || {})
  };
}

// ---------------------------------------------------------------------------
// Similar implementation finder
// ---------------------------------------------------------------------------

/**
 * Find examples of implementations similar to a given feature type.
 */
function findSimilarImplementations(artifacts, instance, featureType) {
  const typeLower = featureType.toLowerCase();
  const terms = typeLower.split(/[\s_-]+/);

  // Score each artifact by relevance to the feature type
  const scored = [];
  for (const [artPath, art] of artifacts) {
    const searchText = [
      artPath,
      art.type || '',
      art.kind || '',
      art.summary || '',
      art.intent || '',
      ...(art.tags || []),
      ...(art.exports || [])
    ].join(' ').toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (searchText.includes(term)) score++;
    }

    // Exact type match bonus
    if ((art.type || '').toLowerCase() === typeLower) score += 3;
    if ((art.kind || '').toLowerCase() === typeLower) score += 2;

    if (score > 0) {
      scored.push({ path: artPath, artifact: art, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topMatches = scored.slice(0, 10);

  // For each match, include its dependency context
  return {
    featureType,
    matchCount: scored.length,
    examples: topMatches.map(m => {
      const outDeps = instance.dependencies
        .filter(d => d.from === m.path)
        .map(d => ({ to: d.to, kind: d.kind }));
      const inDeps = instance.dependencies
        .filter(d => d.to === m.path)
        .map(d => ({ from: d.from, kind: d.kind }));

      return {
        path: m.path,
        relevanceScore: Math.round((m.score / (terms.length + 3)) * 100) / 100,
        type: m.artifact.type,
        kind: m.artifact.kind || null,
        summary: m.artifact.summary || null,
        intent: m.artifact.intent || null,
        exports: m.artifact.exports || [],
        tags: m.artifact.tags || [],
        dependsOn: outDeps.slice(0, 5),
        dependedOnBy: inDeps.slice(0, 5)
      };
    })
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the dominant key in a frequency map.
 */
function findDominant(counts) {
  let max = 0;
  let dominant = null;
  for (const [key, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      dominant = key;
    }
  }
  return dominant;
}

/**
 * Classify a single artifact into an architectural layer.
 * @param {string} artPath
 * @param {Object} art
 * @param {Object} layerKeywords - Layer name → keyword array map.
 * @returns {string} Layer name or 'unclassified'.
 */
function classifyLayer(artPath, art, layerKeywords) {
  const pathLower = artPath.toLowerCase();
  const kindLower = (art.kind || '').toLowerCase();
  const typeLower = (art.type || '').toLowerCase();

  for (const [layer, keywords] of Object.entries(layerKeywords)) {
    for (const kw of keywords) {
      if (pathLower.includes(kw) || kindLower.includes(kw) || typeLower.includes(kw)) {
        return layer;
      }
    }
  }
  return 'unclassified';
}

/**
 * Build a path → layer lookup map.
 */
function buildLayerLookup(artifacts, layerKeywords) {
  const lookup = new Map();
  for (const [artPath, art] of artifacts) {
    const layer = classifyLayer(artPath, art, layerKeywords);
    if (layer !== 'unclassified') {
      lookup.set(artPath, layer);
    }
  }
  return lookup;
}

module.exports = { discoverPatterns, detectNamingConvention, findDominant };
