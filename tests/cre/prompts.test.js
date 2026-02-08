'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const analyzeAmbiguities = require('../../src/main/cre/lib/prompts/analyze-ambiguities');
const generatePlan = require('../../src/main/cre/lib/prompts/generate-plan');
const refinePlan = require('../../src/main/cre/lib/prompts/refine-plan');
const generateAssertions = require('../../src/main/cre/lib/prompts/generate-assertions');
const generateRis = require('../../src/main/cre/lib/prompts/generate-ris');
const inferIntent = require('../../src/main/cre/lib/prompts/infer-intent');
const assessRelevance = require('../../src/main/cre/lib/prompts/assess-relevance');
const identifySchemaGaps = require('../../src/main/cre/lib/prompts/identify-schema-gaps');

const ALL_MODULES = [
  { name: 'analyze-ambiguities', mod: analyzeAmbiguities, op: 'GROUND' },
  { name: 'generate-plan', mod: generatePlan, op: 'FOLLOW' },
  { name: 'refine-plan', mod: refinePlan, op: 'FOLLOW' },
  { name: 'generate-assertions', mod: generateAssertions, op: 'DERIVE' },
  { name: 'generate-ris', mod: generateRis, op: 'FOLLOW' },
  { name: 'infer-intent', mod: inferIntent, op: 'GROUND' },
  { name: 'assess-relevance', mod: assessRelevance, op: 'JUDGE' },
  { name: 'identify-schema-gaps', mod: identifySchemaGaps, op: 'DERIVE' },
];

// Minimal fixtures
const story = { id: 'S1', title: 'Test Story', description: 'A test', acceptanceCriteria: ['AC1'] };
const planItem = { order: 1, storyId: 'S1', approach: 'test approach', filesCreated: ['a.js'], filesModified: ['b.js'], dependencies: [] };
const schema = { version: '1.0', m3Version: '2.0', elementTypes: {} };
const instance = { schemaVersion: '1.0', artifacts: {}, dependencies: [], flows: {} };

/**
 * Build a prompt from each module with minimal valid args.
 */
function buildFor(name) {
  switch (name) {
    case 'analyze-ambiguities': return analyzeAmbiguities.buildPrompt({ stories: [story] });
    case 'generate-plan': return generatePlan.buildPrompt({ stories: [story] });
    case 'refine-plan': return refinePlan.buildPrompt({ plan: { planItems: [] }, feedback: 'looks good' });
    case 'generate-assertions': return generateAssertions.buildPrompt({ planItem, story });
    case 'generate-ris': return generateRis.buildPrompt({ planItem, story });
    case 'infer-intent': return inferIntent.buildPrompt({ sourceCode: 'const x = 1;', filePath: 'x.js' });
    case 'assess-relevance': return assessRelevance.buildPrompt({ taskDescription: 'add login', artifacts: [{ path: 'auth.js', summary: 'auth module' }] });
    case 'identify-schema-gaps': return identifySchemaGaps.buildPrompt({ schema, instance });
    default: throw new Error(`Unknown module: ${name}`);
  }
}

// --- AC10: Each template includes system context, task description, and output constraints ---

describe('Prompt templates — structure', () => {
  for (const { name, mod } of ALL_MODULES) {
    it(`${name} exports buildPrompt function`, () => {
      assert.equal(typeof mod.buildPrompt, 'function');
    });

    it(`${name} returns { system, task, constraints }`, () => {
      const result = buildFor(name);
      assert.ok(result.system, 'system must be non-empty');
      assert.ok(result.task, 'task must be non-empty');
      assert.ok(result.constraints, 'constraints must be non-empty');
      assert.equal(typeof result.system, 'string');
      assert.equal(typeof result.task, 'string');
      assert.equal(typeof result.constraints, 'string');
    });

    it(`${name} constraints require raw JSON output`, () => {
      const { constraints } = buildFor(name);
      assert.ok(constraints.includes('raw JSON only'), `${name} should require raw JSON output`);
    });
  }
});

// --- AC2-AC9: Operation-specific tests ---

describe('analyze-ambiguities (GROUND)', () => {
  it('includes GROUND principle in system', () => {
    const { system } = buildFor('analyze-ambiguities');
    assert.ok(system.includes('GROUND'));
  });

  it('embeds story data in task', () => {
    const { task } = buildFor('analyze-ambiguities');
    assert.ok(task.includes('Test Story'));
    assert.ok(task.includes('S1'));
  });

  it('includes optional codeModelSummary when provided', () => {
    const { task } = analyzeAmbiguities.buildPrompt({ stories: [story], codeModelSummary: 'has 10 modules' });
    assert.ok(task.includes('has 10 modules'));
  });
});

describe('generate-plan (FOLLOW)', () => {
  it('includes FOLLOW principle in system', () => {
    const { system } = buildFor('generate-plan');
    assert.ok(system.includes('FOLLOW'));
  });

  it('includes clarification answers when provided', () => {
    const { task } = generatePlan.buildPrompt({ stories: [story], answers: [{ question: 'Q?', answer: 'A.' }] });
    assert.ok(task.includes('Q?'));
    assert.ok(task.includes('A.'));
  });

  it('output schema includes planItems, sharedComponents, risks', () => {
    const { constraints } = buildFor('generate-plan');
    assert.ok(constraints.includes('planItems'));
    assert.ok(constraints.includes('sharedComponents'));
    assert.ok(constraints.includes('risks'));
  });
});

describe('refine-plan (FOLLOW)', () => {
  it('includes iteration number in task', () => {
    const { task } = refinePlan.buildPrompt({ plan: {}, feedback: 'f', iteration: 3 });
    assert.ok(task.includes('iteration 3'));
  });

  it('requires changelog in output', () => {
    const { constraints } = buildFor('refine-plan');
    assert.ok(constraints.includes('changelog'));
  });
});

describe('generate-assertions (DERIVE)', () => {
  it('includes DERIVE principle in system', () => {
    const { system } = buildFor('generate-assertions');
    assert.ok(system.includes('DERIVE'));
  });

  it('references acceptance criteria in task', () => {
    const { task } = buildFor('generate-assertions');
    assert.ok(task.includes('AC1'));
  });

  it('supports assertion types: file_exists, function_exists, export_exists, pattern_match', () => {
    const { constraints } = buildFor('generate-assertions');
    for (const type of ['file_exists', 'function_exists', 'export_exists', 'pattern_match']) {
      assert.ok(constraints.includes(type), `should include ${type}`);
    }
  });
});

describe('generate-ris (FOLLOW)', () => {
  it('references RIS markdown sections', () => {
    const { constraints } = buildFor('generate-ris');
    for (const section of ['Context', 'Objective', 'Instructions', 'Conventions', 'Assertions']) {
      assert.ok(constraints.includes(section), `should reference ${section} section`);
    }
  });

  it('respects maxLength parameter', () => {
    const { constraints } = generateRis.buildPrompt({ planItem, story, maxLength: 3000 });
    assert.ok(constraints.includes('3000'));
  });
});

describe('infer-intent (GROUND)', () => {
  it('includes GROUND principle in system', () => {
    const { system } = buildFor('infer-intent');
    assert.ok(system.includes('GROUND'));
  });

  it('embeds source code in task', () => {
    const { task } = buildFor('infer-intent');
    assert.ok(task.includes('const x = 1;'));
  });

  it('output includes PROSE fields: summary, intent, behavior', () => {
    const { constraints } = buildFor('infer-intent');
    assert.ok(constraints.includes('summary'));
    assert.ok(constraints.includes('intent'));
    assert.ok(constraints.includes('behavior'));
  });
});

describe('assess-relevance (JUDGE)', () => {
  it('includes JUDGE principle in system', () => {
    const { system } = buildFor('assess-relevance');
    assert.ok(system.includes('JUDGE'));
  });

  it('embeds artifact list in task', () => {
    const { task } = buildFor('assess-relevance');
    assert.ok(task.includes('auth.js'));
  });

  it('output includes ranked array with score', () => {
    const { constraints } = buildFor('assess-relevance');
    assert.ok(constraints.includes('ranked'));
    assert.ok(constraints.includes('score'));
  });
});

describe('identify-schema-gaps (DERIVE)', () => {
  it('includes DERIVE principle and h-M3 reference in system', () => {
    const { system } = buildFor('identify-schema-gaps');
    assert.ok(system.includes('DERIVE'));
    assert.ok(system.includes('h-M3'));
  });

  it('includes instance statistics in task', () => {
    const { task } = buildFor('identify-schema-gaps');
    assert.ok(task.includes('Artifacts:'));
    assert.ok(task.includes('Dependencies:'));
  });

  it('includes recent changes when provided', () => {
    const { task } = identifySchemaGaps.buildPrompt({ schema, instance, recentChanges: ['added auth module'] });
    assert.ok(task.includes('added auth module'));
  });
});
