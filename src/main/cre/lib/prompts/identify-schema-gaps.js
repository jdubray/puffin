'use strict';

/**
 * @module prompts/identify-schema-gaps
 * DERIVE operation — proposes h-DSL schema extensions.
 *
 * Analyzes code model instance data against the current schema to
 * identify patterns that would benefit from new element types or fields.
 */

/**
 * Builds the identify-schema-gaps prompt.
 *
 * @param {Object} params
 * @param {Object} params.schema - Current h-DSL schema.
 * @param {Object} params.instance - Current code model instance.
 * @param {Array<string>} [params.recentChanges] - Descriptions of recent codebase changes.
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ schema, instance, recentChanges = [] }) {
  const system = `You are analyzing a code model schema for gaps and extension opportunities. You operate using the DERIVE principle: generate new structural knowledge from existing patterns.

The schema uses h-M3 v2 primitives: TERM (formal/symbolic), PROSE (natural language), SLOT (position), RELATION (connection).`;

  const changesBlock = recentChanges.length > 0
    ? `\nRECENT CODEBASE CHANGES:\n${recentChanges.map(c => `- ${c}`).join('\n')}\n`
    : '';

  const artifactCount = Object.keys(instance.artifacts || {}).length;
  const depCount = (instance.dependencies || []).length;
  const flowCount = Object.keys(instance.flows || {}).length;

  const task = `Analyze the following schema and instance for gaps that would improve code model coverage.

CURRENT SCHEMA:
${JSON.stringify(schema, null, 2)}

INSTANCE STATISTICS:
- Artifacts: ${artifactCount}
- Dependencies: ${depCount}
- Flows: ${flowCount}
${changesBlock}
Identify:
1. Patterns in the codebase not captured by current element types
2. Fields missing from existing element types
3. Relation types that should be added`;

  const constraints = `OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "proposedExtensions": [
    {
      "type": "new_element_type" | "new_field" | "new_relation_kind",
      "target": "<element type name or new type name>",
      "definition": {
        "m3Type": "SLOT" | "RELATION",
        "fields": {}
      },
      "rationale": "<why this extension is needed>",
      "priority": "high" | "medium" | "low"
    }
  ],
  "coverage": {
    "score": <0.0 to 1.0>,
    "gaps": ["<description of uncovered pattern>"]
  }
}

RULES:
- Only propose extensions that address concrete gaps
- New fields must specify m3Type (TERM or PROSE)
- Prefer extending existing types over creating new ones
- If schema is sufficient, return empty proposedExtensions array
- Do NOT use markdown code blocks — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
