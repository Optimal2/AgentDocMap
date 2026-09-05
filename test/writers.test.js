import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeAgentDocs } from '../src/lib/writers.js';

function createMinimalMap() {
  return {
    project: {
      name: 'FixtureProject',
      packageName: 'fixture-project',
      packageVersion: '1.0.0',
      description: 'Fixture project.',
      dependencies: {},
      devDependencies: {},
      packageScripts: {},
    },
    generated: {
      atUtc: 'example',
      commit: null,
      commitDate: null,
      branch: null,
      dirty: false,
    },
    stats: {
      fileCount: 0,
      sourceLineCount: 0,
      docletCount: 0,
      documentedFileCount: 0,
      lowConfidenceSummaryCount: 0,
      parseErrorCount: 0,
      estimatedSourceTokens: 0,
    },
    importantFiles: [],
    recommendations: [],
    crossCutting: {
      roles: [],
      riskPatterns: [],
    },
    packageUsage: [],
    files: [],
    symbols: [],
    modules: [],
  };
}

test('DEPENDENCIES.md states how many Used In files are hidden and marks dynamic imports', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-deps-'));
  const target = path.join(sandbox, 'fixture-project');
  const out = path.join(target, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  const map = createMinimalMap();
  map.project.dependencies = {
    'many-files': '1.0.0',
    'mixed-kinds': '2.0.0',
    'only-dynamic': '3.0.0',
    'five-files': '4.0.0',
  };
  map.project.devDependencies = {
    'dev-dynamic': '5.0.0',
  };
  const manyFiles = Array.from({ length: 8 }, (_, index) => `src/file-${index + 1}.js`);
  map.packageUsage = [
    { packageName: 'many-files', importCount: 9, dynamicImportCount: 0, files: manyFiles },
    { packageName: 'mixed-kinds', importCount: 3, dynamicImportCount: 1, files: ['src/a.js', 'src/b.js'] },
    { packageName: 'only-dynamic', importCount: 2, dynamicImportCount: 2, files: ['src/c.js'] },
    { packageName: 'five-files', importCount: 5, dynamicImportCount: 0, files: manyFiles.slice(0, 5) },
    { packageName: 'dev-dynamic', importCount: 1, dynamicImportCount: 1, files: ['src/d.js'] },
  ];

  try {
    await writeAgentDocs({ outDir: out, clean: true, targetRoot: target, map });
    const dependencies = await fs.readFile(path.join(out, 'DEPENDENCIES.md'), 'utf8');
    const rows = Object.fromEntries(
      dependencies
        .split('\n')
        .filter((line) => line.startsWith('| <code>'))
        .map((line) => [line.match(/^\| <code>([^<]+)<\/code>/)[1], line]),
    );

    assert.equal(
      rows['many-files'],
      '| <code>many-files</code> | <code>1.0.0</code> | 9 | '
        + manyFiles.slice(0, 5).map((file) => `<code>${file}</code>`).join('<br>')
        + '<br>... (+3 more, 8 files total) |',
    );
    assert.equal(rows['five-files'].includes('more'), false);
    assert.equal(rows['five-files'].includes('<code>src/file-5.js</code> |'), true);
    assert.equal(rows['mixed-kinds'].includes('| 3 (1 dynamic) |'), true);
    assert.equal(rows['only-dynamic'].includes('| 2 (dynamic) |'), true);
    assert.equal(rows['dev-dynamic'], '| <code>dev-dynamic</code> | <code>5.0.0</code> | 1 (dynamic) |');
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }
});

test('DEPENDENCIES.md renders declared dependencies without observed imports as zero with an empty Used In cell', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-deps-'));
  const target = path.join(sandbox, 'fixture-project');
  const out = path.join(target, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  const map = createMinimalMap();
  map.project.dependencies = {
    'no-usage-entry': '1.0.0',
    'empty-usage': '2.0.0',
  };
  map.project.devDependencies = {
    'dev-no-usage-entry': '3.0.0',
  };
  // 'no-usage-entry' and 'dev-no-usage-entry' have no packageUsage entry at all (usage is undefined);
  // 'empty-usage' has an entry with zero observed imports and no files.
  map.packageUsage = [
    { packageName: 'empty-usage', importCount: 0, dynamicImportCount: 0, files: [] },
  ];

  try {
    await writeAgentDocs({ outDir: out, clean: true, targetRoot: target, map });
    const dependencies = await fs.readFile(path.join(out, 'DEPENDENCIES.md'), 'utf8');
    const rows = dependencies.split('\n').filter((line) => line.startsWith('| <code>'));

    assert.deepEqual(rows, [
      '| <code>empty-usage</code> | <code>2.0.0</code> | 0 |  |',
      '| <code>no-usage-entry</code> | <code>1.0.0</code> | 0 |  |',
      '| <code>dev-no-usage-entry</code> | <code>3.0.0</code> | 0 |',
    ]);
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }
});

test('writeAgentDocs rejects cleaning the target repository root even when the name is allowlisted', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  const target = path.join(sandbox, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  await assert.rejects(
    writeAgentDocs({
      outDir: target,
      clean: true,
      targetRoot: target,
      map: createMinimalMap(),
    }),
    /overlaps the target repository root/,
  );
});

test('writeAgentDocs rejects cleaning an allowlisted ancestor of the target repository root', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  const out = path.join(sandbox, 'docs-agent');
  const target = path.join(out, 'fixture-project');
  await fs.mkdir(target, { recursive: true });

  await assert.rejects(
    writeAgentDocs({
      outDir: out,
      clean: true,
      targetRoot: target,
      map: createMinimalMap(),
    }),
    /overlaps the target repository root/,
  );
});

test('writeAgentDocs still allows writing to docs-agent inside the target repository root', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  const target = path.join(sandbox, 'fixture-project');
  const out = path.join(target, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  const result = await writeAgentDocs({
    outDir: out,
    clean: true,
    targetRoot: target,
    map: createMinimalMap(),
  });

  assert.equal(result.length > 0, true);
  await assert.doesNotReject(fs.access(path.join(out, 'AGENT_CONTEXT.md')));
});

test('writeAgentDocs rejects cleaning common system directories', async () => {
  const outDir = process.platform === 'win32'
    ? (process.env.ProgramData || process.env.SystemRoot)
    : '/usr';

  await assert.rejects(
    writeAgentDocs({
      outDir,
      clean: true,
      targetRoot: path.join(os.tmpdir(), 'agentdocmap-target'),
      map: createMinimalMap(),
    }),
    /Refusing to clean unsafe AgentDocMap output directory/,
  );
});
