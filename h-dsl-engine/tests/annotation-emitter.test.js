/**
 * @module tests/annotation-emitter
 * Unit tests for annotation-emitter render functions and yamlEscape.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  _yamlEscape: yamlEscape,
  _renderHeader: renderHeader,
  _renderArtifactSummary: renderArtifactSummary,
  _renderIntent: renderIntent,
  _renderStructure: renderStructure,
  _renderSymbols: renderSymbols,
  _renderDependencies: renderDependencies,
  _renderPatterns: renderPatterns,
  _renderHotspots: renderHotspots,
  _renderUnderstanding: renderUnderstanding
} = require('../lib/annotation-emitter');

// ---------------------------------------------------------------------------
// yamlEscape
// ---------------------------------------------------------------------------

describe('yamlEscape', () => {
  it('returns empty string for null/undefined', () => {
    assert.equal(yamlEscape(null), '');
    assert.equal(yamlEscape(undefined), '');
  });

  it('escapes double quotes', () => {
    assert.equal(yamlEscape('say "hello"'), 'say \\"hello\\"');
  });

  it('escapes backslashes', () => {
    assert.equal(yamlEscape('a\\b'), 'a\\\\b');
  });

  it('replaces newlines with spaces', () => {
    assert.equal(yamlEscape('line1\nline2'), 'line1 line2');
  });

  it('strips carriage returns', () => {
    assert.equal(yamlEscape('a\r\nb'), 'a b');
  });

  it('handles combined metacharacters', () => {
    assert.equal(yamlEscape('"a\\b"\nc'), '\\"a\\\\b\\" c');
  });

  it('coerces numbers to string', () => {
    assert.equal(yamlEscape(42), '42');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArtifact(overrides = {}) {
  return {
    kind: 'module',
    type: 'module',
    summary: 'Test module summary',
    intent: 'Test module intent',
    exports: ['foo', 'bar'],
    tags: ['service', 'entry-point'],
    size: 1234,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// renderHeader
// ---------------------------------------------------------------------------

describe('renderHeader', () => {
  it('renders header with filename, path, kind, and m3Type', () => {
    const out = renderHeader('index.js', 'src/index.js', makeArtifact(), 'SLOT');
    assert.ok(out.includes('# Annotations: index.js'));
    assert.ok(out.includes('`src/index.js`'));
    assert.ok(out.includes('SLOT'));
    assert.ok(out.includes('service, entry-point'));
  });

  it('omits parenthetical when tags are empty', () => {
    const out = renderHeader('a.js', 'a.js', makeArtifact({ tags: [] }), 'SLOT');
    assert.ok(!out.includes('general'));
    assert.ok(!out.includes('()'));
    assert.ok(out.includes('module'));
  });
});

// ---------------------------------------------------------------------------
// renderArtifactSummary
// ---------------------------------------------------------------------------

describe('renderArtifactSummary', () => {
  it('renders YAML block with summary, line count, and tags', () => {
    const source = 'line1\nline2\nline3\n';
    const out = renderArtifactSummary('src/a.js', makeArtifact(), source);
    assert.ok(out.includes('path: src/a.js'));
    assert.ok(out.includes('kind: module'));
    assert.ok(out.includes('summary: "Test module summary"'));
    assert.ok(out.includes('4 lines'));
    assert.ok(out.includes('2 exports'));
    assert.ok(out.includes('"service"'));
  });

  it('escapes YAML metacharacters in summary', () => {
    const art = makeArtifact({ summary: 'uses "quotes" and\nnewlines' });
    const out = renderArtifactSummary('a.js', art, '');
    assert.ok(out.includes('\\"quotes\\"'));
    assert.ok(!out.includes('\n  summary: "uses "quotes"'));
  });
});

// ---------------------------------------------------------------------------
// renderIntent
// ---------------------------------------------------------------------------

describe('renderIntent', () => {
  it('uses deepAnalysis intent when available', () => {
    const out = renderIntent(makeArtifact(), { intent: 'Deep intent text' });
    assert.ok(out.includes('Deep intent text'));
  });

  it('falls back to artifact intent', () => {
    const out = renderIntent(makeArtifact(), null);
    assert.ok(out.includes('Test module intent'));
  });

  it('falls back to summary when no intent', () => {
    const art = makeArtifact({ intent: '' });
    const out = renderIntent(art, null);
    assert.ok(out.includes('Test module summary'));
  });
});

// ---------------------------------------------------------------------------
// renderStructure
// ---------------------------------------------------------------------------

describe('renderStructure', () => {
  it('renders table from deepAnalysis structure', () => {
    const deep = {
      structure: [
        { name: 'Imports', lines: '1-10', description: 'Import section', symbolCount: 3 },
        { name: 'Core', lines: '11-50', description: 'Main logic', symbolCount: 8 }
      ]
    };
    const out = renderStructure(makeArtifact(), deep, '');
    assert.ok(out.includes('| 1 | Imports |'));
    assert.ok(out.includes('| 2 | Core |'));
    assert.ok(out.includes('SLOT'));
  });

  it('falls back to exports list when no deepAnalysis', () => {
    const out = renderStructure(makeArtifact(), null, '');
    assert.ok(out.includes('exports 2 symbols'));
    assert.ok(out.includes('foo, bar'));
  });

  it('shows unavailable message when no exports and no AI', () => {
    const out = renderStructure(makeArtifact({ exports: [] }), null, '');
    assert.ok(out.includes('unavailable'));
  });
});

// ---------------------------------------------------------------------------
// renderSymbols
// ---------------------------------------------------------------------------

describe('renderSymbols', () => {
  it('renders AI-derived symbols with escaping', () => {
    const deep = {
      symbols: [
        { name: 'doStuff', role: 'Main "entry" function', type: 'TERM' },
        { name: 'helper', role: 'utility', type: 'TERM' }
      ]
    };
    const out = renderSymbols(makeArtifact(), deep);
    assert.ok(out.includes('name: doStuff'));
    assert.ok(out.includes('role: "Main \\"entry\\" function"'));
    assert.ok(out.includes('name: helper'));
  });

  it('falls back to artifact exports', () => {
    const out = renderSymbols(makeArtifact(), null);
    assert.ok(out.includes('name: foo'));
    assert.ok(out.includes('name: bar'));
    assert.ok(out.includes('exported symbol'));
  });

  it('shows "No symbols" when empty', () => {
    const out = renderSymbols(makeArtifact({ exports: [] }), null);
    assert.ok(out.includes('No symbols extracted'));
  });
});

// ---------------------------------------------------------------------------
// renderDependencies
// ---------------------------------------------------------------------------

describe('renderDependencies', () => {
  it('renders outbound and inbound deps', () => {
    const outbound = [{ from: 'a.js', to: 'b.js', kind: 'imports', weight: 'normal' }];
    const inbound = [{ from: 'c.js', to: 'a.js', kind: 'calls', weight: 'critical' }];
    const out = renderDependencies('a.js', outbound, inbound);
    assert.ok(out.includes('from: a.js'));
    assert.ok(out.includes('to: b.js'));
    assert.ok(out.includes('kind: imports'));
    assert.ok(out.includes('from: c.js'));
    assert.ok(out.includes('direction: inbound'));
  });

  it('renders "No dependencies" when both empty', () => {
    const out = renderDependencies('a.js', [], []);
    assert.ok(out.includes('No dependencies detected'));
  });

  it('escapes intent strings', () => {
    const outbound = [{ from: 'a.js', to: 'b.js', kind: 'imports', weight: 'normal', intent: 'uses "config"' }];
    const out = renderDependencies('a.js', outbound, []);
    assert.ok(out.includes('\\"config\\"'));
  });
});

// ---------------------------------------------------------------------------
// renderPatterns
// ---------------------------------------------------------------------------

describe('renderPatterns', () => {
  it('renders pattern list from deepAnalysis', () => {
    const out = renderPatterns({ patterns: ['Factory pattern', 'Observer pattern'] });
    assert.ok(out.includes('- Factory pattern'));
    assert.ok(out.includes('- Observer pattern'));
  });

  it('shows "No patterns" without deepAnalysis', () => {
    const out = renderPatterns(null);
    assert.ok(out.includes('No patterns identified'));
  });
});

// ---------------------------------------------------------------------------
// renderHotspots
// ---------------------------------------------------------------------------

describe('renderHotspots', () => {
  it('renders hotspots with escaping', () => {
    const deep = {
      hotspots: [{ location: 'file.js:42', description: 'Complex "nested" logic' }]
    };
    const out = renderHotspots(deep);
    assert.ok(out.includes('path: "file.js:42"'));
    assert.ok(out.includes('\\"nested\\"'));
  });

  it('shows "No notable hotspots" without data', () => {
    const out = renderHotspots(null);
    assert.ok(out.includes('No notable hotspots'));
  });
});

// ---------------------------------------------------------------------------
// renderUnderstanding
// ---------------------------------------------------------------------------

describe('renderUnderstanding', () => {
  it('renders with deepAnalysis findings and gaps', () => {
    const deep = {
      keyFindings: ['Pure functions', 'No side effects'],
      gaps: ['Missing error paths']
    };
    const out = renderUnderstanding('src/a.js', makeArtifact(), deep);
    assert.ok(out.includes('confidence: 0.85'));
    assert.ok(out.includes('Pure functions'));
    assert.ok(out.includes('Missing error paths'));
    assert.ok(out.includes('a.js'));
  });

  it('falls back to artifact summary with low confidence', () => {
    const out = renderUnderstanding('src/a.js', makeArtifact(), null);
    assert.ok(out.includes('confidence: 0.5'));
    assert.ok(out.includes('Test module summary'));
    assert.ok(out.includes('annotations are structural only'));
  });

  it('escapes YAML in findings', () => {
    const deep = {
      keyFindings: ['Uses "dangerous" pattern'],
      gaps: []
    };
    const out = renderUnderstanding('a.js', makeArtifact(), deep);
    assert.ok(out.includes('\\"dangerous\\"'));
  });
});
