'use strict';

/**
 * @module ris-formatter
 * Formats RIS (Refined Implementation Specification) data into markdown.
 *
 * A RIS document has four sections:
 *   1. Context — branch, dependencies, code model version
 *   2. Objective — what the implementation achieves
 *   3. Instructions — step-by-step implementation guide
 *   4. Conventions — coding standards and patterns
 */

/**
 * Formats a complete RIS data object into markdown.
 *
 * @param {Object} risData
 * @param {Object} risData.context - Context metadata.
 * @param {string} [risData.context.branch] - Current branch name.
 * @param {Array<string>} [risData.context.dependencies] - Dependency list.
 * @param {string} [risData.context.codeModelVersion] - Code model schema version.
 * @param {string} risData.objective - What this implementation achieves.
 * @param {Array<string>} risData.instructions - Ordered implementation steps.
 * @param {Array<string>} [risData.conventions] - Coding conventions to follow.
 * @returns {string} Formatted markdown string.
 */
function formatRis(risData) {
  const sections = [
    formatContext(risData.context || {}),
    formatObjective(risData.objective || ''),
    formatInstructions(risData.instructions || []),
    formatConventions(risData.conventions || [])
  ];

  return sections.join('\n\n');
}

/**
 * @param {Object} context
 * @returns {string}
 */
function formatContext(context) {
  const lines = ['## Context', ''];
  lines.push(`- **Branch:** ${context.branch || 'unknown'}`);

  const deps = context.dependencies || [];
  if (deps.length > 0) {
    lines.push(`- **Dependencies:** ${deps.join(', ')}`);
  } else {
    lines.push('- **Dependencies:** none');
  }

  lines.push(`- **Code Model Version:** ${context.codeModelVersion || 'n/a'}`);
  return lines.join('\n');
}

/**
 * @param {string} objective
 * @returns {string}
 */
function formatObjective(objective) {
  return `## Objective\n\n${objective}`;
}

/**
 * @param {Array<string>} instructions
 * @returns {string}
 */
function formatInstructions(instructions) {
  if (instructions.length === 0) {
    return '## Instructions\n\nNo instructions provided.';
  }
  const steps = instructions.map((step, i) => `${i + 1}. ${step}`).join('\n');
  return `## Instructions\n\n${steps}`;
}

/**
 * @param {Array<string>} conventions
 * @returns {string}
 */
function formatConventions(conventions) {
  if (conventions.length === 0) {
    return '## Conventions\n\nFollow project defaults.';
  }
  const items = conventions.map(c => `- ${c}`).join('\n');
  return `## Conventions\n\n${items}`;
}

module.exports = {
  formatRis,
  formatContext,
  formatObjective,
  formatInstructions,
  formatConventions
};
