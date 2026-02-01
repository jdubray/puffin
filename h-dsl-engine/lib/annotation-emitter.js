/**
 * @module annotation-emitter
 * Phase 5: ANNOTATE — generate .an.md annotation files for each artifact.
 *
 * Produces human-readable, h-M3-typed annotation markdown files following
 * the established format: Artifact Summary, Intent, Structure, Symbols,
 * Dependencies, Patterns, Hotspots, Understanding.
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const { M3Primitives } = require('./hdsl-types');
const { aiQuery } = require('./ai-client');

/** Max source chars sent to AI for deep annotation. */
const MAX_ANNOTATION_CONTENT = 6000;

/** Number of artifacts to process concurrently in each batch. */
const ANNOTATION_BATCH_SIZE = 4;

/**
 * Escape a string for safe embedding inside a double-quoted YAML value.
 * Handles double quotes, backslashes, and newlines.
 * @param {string} str
 * @returns {string}
 */
function yamlEscape(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

/**
 * Generate .an.md annotation files for all source artifacts.
 *
 * @param {Object} params
 * @param {Object} params.schema - The h-DSL schema.
 * @param {Object} params.instance - The populated Code Model instance.
 * @param {string} params.projectRoot - Absolute project root.
 * @param {string} params.outputDir - Output directory for annotation files.
 * @param {Function} params.log
 * @returns {Promise<string[]>} Paths of generated annotation files.
 */
async function emitAnnotations({ schema, instance, projectRoot, outputDir, log }) {
  const sourceArtifacts = Object.entries(instance.artifacts)
    .filter(([, art]) => art.kind === 'module' || art.kind === 'file');

  log(`  Generating annotations for ${sourceArtifacts.length} source artifacts`);

  // Pre-build adjacency maps for O(1) dependency lookup per artifact
  const outboundMap = new Map();
  const inboundMap = new Map();
  for (const dep of instance.dependencies) {
    if (!outboundMap.has(dep.from)) outboundMap.set(dep.from, []);
    outboundMap.get(dep.from).push(dep);
    if (!inboundMap.has(dep.to)) inboundMap.set(dep.to, []);
    inboundMap.get(dep.to).push(dep);
  }

  const annotationDir = path.join(outputDir, 'annotations');
  await fs.mkdir(annotationDir, { recursive: true });

  const written = [];

  // Process in batches to overlap file I/O and bound sequential AI calls
  for (let i = 0; i < sourceArtifacts.length; i += ANNOTATION_BATCH_SIZE) {
    const batch = sourceArtifacts.slice(i, i + ANNOTATION_BATCH_SIZE);

    const results = await Promise.all(batch.map(async ([artPath, artifact]) => {
      const annotationContent = await buildAnnotation({
        artPath,
        artifact,
        schema,
        outboundDeps: outboundMap.get(artPath) || [],
        inboundDeps: inboundMap.get(artPath) || [],
        projectRoot,
        log
      });

      const annFileName = path.basename(artPath) + '.an.md';
      const annDir = path.join(annotationDir, path.dirname(artPath));
      await fs.mkdir(annDir, { recursive: true });
      const annPath = path.join(annDir, annFileName);
      await fs.writeFile(annPath, annotationContent, 'utf-8');
      log(`    ${artPath} → ${annFileName}`);
      return annPath;
    }));

    written.push(...results);
  }

  return written;
}

/**
 * Build a complete .an.md annotation for a single artifact.
 *
 * @param {Object} params
 * @param {string} params.artPath
 * @param {Object} params.artifact
 * @param {Object} params.schema
 * @param {Array} params.outboundDeps - Pre-built outbound dependencies for this artifact.
 * @param {Array} params.inboundDeps - Pre-built inbound dependencies for this artifact.
 * @param {string} params.projectRoot
 * @param {Function} params.log
 * @returns {Promise<string>}
 */
async function buildAnnotation({ artPath, artifact, schema, outboundDeps, inboundDeps, projectRoot, log }) {
  // Read source file for deep analysis
  let source = '';
  try {
    source = await fs.readFile(path.join(projectRoot, artPath), 'utf-8');
  } catch { /* ignore read errors */ }

  const fileName = path.basename(artPath);
  const elementType = schema.elementTypes[artifact.type] || schema.elementTypes.module;
  const m3Type = elementType ? elementType.m3Type : M3Primitives.SLOT;

  // Try AI-powered deep analysis if source is available
  const deepAnalysis = source
    ? await getDeepAnalysis(artPath, source.slice(0, MAX_ANNOTATION_CONTENT), log)
    : null;

  const sections = [];

  // Header
  sections.push(renderHeader(fileName, artPath, artifact, m3Type));
  sections.push('---\n');

  // Artifact Summary
  sections.push(renderArtifactSummary(artPath, artifact, source));
  sections.push('');

  // Intent
  sections.push(renderIntent(artifact, deepAnalysis));
  sections.push('---\n');

  // Structure
  sections.push(renderStructure(artifact, deepAnalysis, source));
  sections.push('---\n');

  // Symbols
  sections.push(renderSymbols(artifact, deepAnalysis));
  sections.push('---\n');

  // Dependencies
  sections.push(renderDependencies(artPath, outboundDeps, inboundDeps));
  sections.push('---\n');

  // Patterns
  sections.push(renderPatterns(deepAnalysis));
  sections.push('---\n');

  // Hotspots
  sections.push(renderHotspots(deepAnalysis));
  sections.push('---\n');

  // Understanding
  sections.push(renderUnderstanding(artPath, artifact, deepAnalysis));

  return sections.join('\n');
}

/**
 * Ask AI for a deep structural analysis of the source file.
 * Returns null on failure (graceful degradation).
 * Note: aiQuery uses execFileSync so this is synchronous despite returning from an async caller.
 */
function getDeepAnalysis(artPath, source, log) {
  const systemPrompt = `You are an expert code annotator using the h-M3 v2 framework.
Analyze the given source file and return a JSON object with:
{
  "intent": "2-3 sentences explaining the purpose and design rationale",
  "structure": [{ "name": "section name", "lines": "start-end", "description": "what this section does", "symbolCount": N }],
  "symbols": [{ "name": "symbol", "role": "description", "type": "TERM" }],
  "patterns": ["pattern description 1", "pattern description 2"],
  "hotspots": [{ "location": "file:lines", "description": "why this is notable" }],
  "keyFindings": ["finding 1", "finding 2"],
  "gaps": ["gap 1"]
}
Return ONLY valid JSON — no markdown code blocks.`;

  const userPrompt = `Analyze this file: ${artPath}\n\n${source}`;
  const result = aiQuery(systemPrompt, userPrompt, { log });

  if (result.success && result.data && typeof result.data === 'object') {
    return result.data;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(fileName, artPath, artifact, m3Type) {
  return `# Annotations: ${fileName}

> **Source**: \`${artPath}\`
> **Kind**: ${artifact.kind}${artifact.tags.length > 0 ? ` (${artifact.tags.join(', ')})` : ''}
> **h-M3 Artifact Type**: ${m3Type}
`;
}

function renderArtifactSummary(artPath, artifact, source) {
  const lineCount = source ? source.split('\n').length : 0;
  const exportCount = (artifact.exports || []).length;
  const tags = (artifact.tags || []).map(t => `"${yamlEscape(t)}"`).join(', ');

  return `## Artifact Summary

\`\`\`yaml
artifact:
  path: ${artPath}
  kind: ${artifact.kind}
  summary: "${yamlEscape(artifact.summary)}"
  size: ${lineCount} lines, ${exportCount} exports
  tags: [${tags}]
\`\`\`
`;
}

function renderIntent(artifact, deepAnalysis) {
  const intent = deepAnalysis && deepAnalysis.intent
    ? deepAnalysis.intent
    : artifact.intent || artifact.summary;

  return `## Intent (PROSE / GROUND)

${intent}
`;
}

function renderStructure(artifact, deepAnalysis, source) {
  let body = '';

  if (deepAnalysis && Array.isArray(deepAnalysis.structure) && deepAnalysis.structure.length > 0) {
    body += '| # | Section | Lines | Symbols | h-M3 | Description |\n';
    body += '|---|---------|-------|---------|-------|-------------|\n';
    deepAnalysis.structure.forEach((s, i) => {
      body += `| ${i + 1} | ${s.name} | ${s.lines || '—'} | ${s.symbolCount || '—'} | SLOT | ${s.description || ''} |\n`;
    });
  } else {
    // Fallback: basic structure from exports
    const exports = artifact.exports || [];
    if (exports.length > 0) {
      body += `Module exports ${exports.length} symbols: ${exports.join(', ')}\n`;
    } else {
      body += 'Structure details unavailable (AI analysis not available).\n';
    }
  }

  return `## Structure (SLOT)

${body}`;
}

function renderSymbols(artifact, deepAnalysis) {
  let body = '';

  if (deepAnalysis && Array.isArray(deepAnalysis.symbols) && deepAnalysis.symbols.length > 0) {
    body += '```yaml\nsymbols:\n';
    for (const sym of deepAnalysis.symbols) {
      body += `  - name: ${yamlEscape(sym.name)}\n`;
      body += `    type: ${yamlEscape(sym.type) || 'TERM'}\n`;
      body += `    role: "${yamlEscape(sym.role)}"\n`;
    }
    body += '```\n';
  } else {
    // Fallback from artifact exports
    const exports = artifact.exports || [];
    if (exports.length > 0) {
      body += '```yaml\nsymbols:\n';
      for (const exp of exports) {
        body += `  - name: ${yamlEscape(exp)}\n    type: TERM\n    role: "exported symbol"\n`;
      }
      body += '```\n';
    } else {
      body += 'No symbols extracted.\n';
    }
  }

  return `## Symbols (TERM)

${body}`;
}

function renderDependencies(artPath, outboundDeps, inboundDeps) {
  if (outboundDeps.length === 0 && inboundDeps.length === 0) {
    return '## Dependencies (RELATION)\n\nNo dependencies detected.\n';
  }

  let body = '```yaml\ndependencies:\n';

  for (const dep of outboundDeps) {
    body += `  - from: ${dep.from}\n`;
    body += `    to: ${dep.to}\n`;
    body += `    kind: ${dep.kind}\n`;
    body += `    weight: ${dep.weight || 'normal'}\n`;
    if (dep.intent) body += `    intent: "${yamlEscape(dep.intent)}"\n`;
  }

  for (const dep of inboundDeps) {
    body += `  - from: ${dep.from}\n`;
    body += `    to: ${dep.to}\n`;
    body += `    kind: ${dep.kind}\n`;
    body += `    weight: ${dep.weight || 'normal'}\n`;
    body += `    direction: inbound\n`;
  }

  body += '```\n';

  return `## Dependencies (RELATION)

${body}`;
}

function renderPatterns(deepAnalysis) {
  if (deepAnalysis && Array.isArray(deepAnalysis.patterns) && deepAnalysis.patterns.length > 0) {
    const items = deepAnalysis.patterns.map(p => `- ${p}`).join('\n');
    return `## Patterns (PROSE / DERIVE)

${items}
`;
  }
  return '## Patterns (PROSE / DERIVE)\n\nNo patterns identified.\n';
}

function renderHotspots(deepAnalysis) {
  if (deepAnalysis && Array.isArray(deepAnalysis.hotspots) && deepAnalysis.hotspots.length > 0) {
    let body = '```yaml\nhotspots:\n';
    for (const h of deepAnalysis.hotspots) {
      body += `  - path: "${yamlEscape(h.location)}"\n`;
      body += `    intent: "${yamlEscape(h.description)}"\n`;
    }
    body += '```\n';
    return `## Hotspots (SLOT)

${body}`;
  }
  return '## Hotspots (SLOT)\n\nNo notable hotspots identified.\n';
}

function renderUnderstanding(artPath, artifact, deepAnalysis) {
  const keyFindings = deepAnalysis && Array.isArray(deepAnalysis.keyFindings)
    ? deepAnalysis.keyFindings.map(f => `    - "${yamlEscape(f)}"`).join('\n')
    : `    - "${yamlEscape(artifact.summary)}"`;

  const gaps = deepAnalysis && Array.isArray(deepAnalysis.gaps)
    ? deepAnalysis.gaps.map(g => `    - "${yamlEscape(g)}"`).join('\n')
    : '    - "AI deep analysis unavailable — annotations are structural only"';

  const confidence = deepAnalysis ? '0.85' : '0.5';

  return `## Understanding (OUTCOME / JUDGE)

\`\`\`yaml
understanding:
  task: "Annotate ${yamlEscape(path.basename(artPath))} for h-M3 Code Model"
  confidence: ${confidence}
  key_findings:
${keyFindings}
  gaps:
${gaps}
\`\`\`
`;
}

module.exports = {
  emitAnnotations,
  // Exported for testing — pure render functions
  _renderHeader: renderHeader,
  _renderArtifactSummary: renderArtifactSummary,
  _renderIntent: renderIntent,
  _renderStructure: renderStructure,
  _renderSymbols: renderSymbols,
  _renderDependencies: renderDependencies,
  _renderPatterns: renderPatterns,
  _renderHotspots: renderHotspots,
  _renderUnderstanding: renderUnderstanding,
  _yamlEscape: yamlEscape
};
