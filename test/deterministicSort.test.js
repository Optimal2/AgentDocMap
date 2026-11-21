import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { buildAgentMap } from '../src/lib/mapBuilder.js';

test('buildAgentMap sorts paths in deterministic code-unit order', () => {
  const paths = ['src/z.js', 'src/Ä.js', 'src/a.js', 'src/Z.js', 'src/A.js'];
  const map = buildAgentMap({
    projectName: 'SortProject',
    targetRoot: path.resolve('test/fixture-project'),
    generatedBy: 'AgentDocMap',
    sourceMetadata: 'none',
    generatedAtUtc: 'example',
    git: { commit: null, commitDate: null, branch: null, dirty: null },
    packageJson: null,
    sourceAnalysis: {
      files: paths.map((filePath) => ({
        path: filePath,
        lines: 1,
        extension: '.js',
        jsdocBlockCount: 0,
        sourceSummary: null,
        imports: [],
        exports: [],
        declarations: [],
        parseError: null,
        signals: { roles: [], riskPatterns: [] },
      })),
    },
    doclets: [],
  });

  assert.deepEqual(
    map.files.map((file) => file.path),
    ['src/A.js', 'src/Z.js', 'src/a.js', 'src/z.js', 'src/Ä.js'],
  );
});
