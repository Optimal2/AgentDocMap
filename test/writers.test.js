import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildAgentMap } from '../src/lib/mapBuilder.js';
import { writeAgentDocs } from '../src/lib/writers.js';

// Mirrors the `generated` block produced by buildAgentMap (src/lib/mapBuilder.js);
// the shape is asserted against the real builder in the source commit test below.
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
      by: 'AgentDocMap',
      atUtc: 'example',
      sourceMetadata: 'git',
      sourceCommit: null,
      sourceBranch: null,
      sourceDirty: false,
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

function createModule(name, fileCount = 0) {
  return {
    name,
    fileCount,
    lineCount: 0,
    docletCount: 0,
    importantFiles: [],
  };
}

function moduleDigest(name) {
  return createHash('sha256').update(name).digest('hex').slice(0, 16);
}

async function readChunks(out) {
  const names = (await fs.readdir(path.join(out, 'chunks'))).sort();
  const contents = await Promise.all(
    names.map((name) => fs.readFile(path.join(out, 'chunks', name), 'utf8')),
  );
  return { names, contents };
}

test('writeAgentDocs preserves chunks whose sanitized module names collide', async (t) => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-collisions-'));
  t.after(() => fs.rm(sandbox, { recursive: true, force: true }));
  const target = path.join(sandbox, 'fixture-project');
  const out = path.join(target, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  const map = createMinimalMap();
  map.modules = ['foo/bar', 'foo_bar'].map((name) => createModule(name));

  await writeAgentDocs({ outDir: out, clean: true, targetRoot: target, map });
  const chunkNames = (await fs.readdir(path.join(out, 'chunks'))).sort();
  assert.equal(chunkNames.length, 2, 'both modules must have a distinct chunk file');

  const chunks = await Promise.all(
    chunkNames.map((name) => fs.readFile(path.join(out, 'chunks', name), 'utf8')),
  );
  assert.equal(chunks.some((content) => content.startsWith('# FixtureProject / foo/bar\n')), true);
  const markdownEscape = '\\';
  assert.equal(chunks.some((content) => content.startsWith(`# FixtureProject / foo${markdownEscape}_bar\n`)), true);
});

test('writeAgentDocs reserves natural names through repeated derived-name collisions', async (t) => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-global-collisions-'));
  t.after(() => fs.rm(sandbox, { recursive: true, force: true }));
  const target = path.join(sandbox, 'fixture-project');
  await fs.mkdir(target, { recursive: true });

  const naturalDigestName = `foo_bar-${moduleDigest('foo/bar')}`;
  const names = ['foo/bar', 'foo_bar', naturalDigestName, `${naturalDigestName}-2`];
  const modules = names.map((name, index) => createModule(name, index + 1));
  const writePackets = async (orderedModules, outName) => {
    const map = createMinimalMap();
    map.modules = orderedModules;
    const out = path.join(target, outName);
    const written = await writeAgentDocs({ outDir: out, clean: false, targetRoot: target, map });
    return { out, written, chunks: await readChunks(out) };
  };

  const first = await writePackets(modules, 'docs-agent');
  assert.equal(first.chunks.names.length, names.length, 'every module must have a physical chunk');
  assert.equal(new Set(first.chunks.names.map((name) => name.toLowerCase())).size, names.length);
  assert.equal(first.chunks.names.includes(`${naturalDigestName}.md`), true, 'the ordinary digest-like name must be preserved');
  assert.equal(first.chunks.names.includes(`${naturalDigestName}-2.md`), true, 'the second ordinary colliding name must be preserved');
  assert.equal(first.chunks.names.includes(`${naturalDigestName}-3.md`), true, 'allocation must continue past repeated collisions');
  assert.equal(first.written.length, 11 + names.length);

  for (let index = 0; index < names.length; index += 1) {
    const marker = `File count: ${index + 1}.`;
    assert.equal(first.chunks.contents.filter((content) => content.includes(marker)).length, 1, `chunk content for ${names[index]} must survive exactly once`);
  }
  const agentMap = JSON.parse(await fs.readFile(path.join(first.out, 'agent-map.json'), 'utf8'));
  assert.deepEqual(agentMap.modules.map((module) => module.name), names);
  const budget = await fs.readFile(path.join(first.out, 'BUDGET.md'), 'utf8');
  const measured = budget.match(/Output files measured: (\d+)/);
  assert.ok(measured);
  assert.equal(Number(measured[1]), 10 + names.length, 'BUDGET.md must count the physically distinct outputs');

  const reversed = await writePackets([...modules].reverse(), 'docs-agent-reversed');
  const shuffled = await writePackets([modules[2], modules[0], modules[3], modules[1]], 'docs-agent-shuffled');
  assert.deepEqual(reversed.chunks, first.chunks, 'reverse input order must not change chunk paths or content');
  assert.deepEqual(shuffled.chunks, first.chunks, 'shuffled input order must not change chunk paths or content');
});

test('writeAgentDocs separates case-only names on a case-insensitive filesystem', async (t) => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-case-collisions-'));
  t.after(() => fs.rm(sandbox, { recursive: true, force: true }));
  const target = path.join(sandbox, 'fixture-project');
  await fs.mkdir(target, { recursive: true });

  const map = createMinimalMap();
  map.modules = ['Foo', 'foo', 'plain'].map((name, index) => createModule(name, index + 1));
  const out = path.join(target, 'docs-agent');
  const written = await writeAgentDocs({ outDir: out, clean: true, targetRoot: target, map });
  const chunks = await readChunks(out);
  const expectedNames = [
    `Foo-${moduleDigest('Foo')}.md`,
    `foo-${moduleDigest('foo')}.md`,
    'plain.md',
  ].sort();
  assert.deepEqual(chunks.names, expectedNames, 'exact-name digests must distinguish case-only names while preserving an unaffected path');
  assert.equal(new Set(chunks.names.map((name) => name.toLowerCase())).size, map.modules.length);
  assert.equal(written.length, 11 + map.modules.length);

  for (let index = 0; index < map.modules.length; index += 1) {
    const marker = `File count: ${index + 1}.`;
    assert.equal(chunks.contents.filter((content) => content.includes(marker)).length, 1, `chunk content for ${map.modules[index].name} must survive exactly once`);
  }
  const budget = await fs.readFile(path.join(out, 'BUDGET.md'), 'utf8');
  const measured = budget.match(/Output files measured: (\d+)/);
  assert.ok(measured);
  assert.equal(Number(measured[1]), 10 + map.modules.length);

  const reversedMap = createMinimalMap();
  reversedMap.modules = [...map.modules].reverse();
  const reversedOut = path.join(target, 'docs-agent-reversed');
  await writeAgentDocs({ outDir: reversedOut, clean: false, targetRoot: target, map: reversedMap });
  assert.deepEqual(await readChunks(reversedOut), chunks, 'case-only allocation must be independent of input order');
});

test('BUDGET.md does not count a trailing newline as an extra output line', async (t) => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-lines-'));
  t.after(() => fs.rm(sandbox, { recursive: true, force: true }));
  const target = path.join(sandbox, 'fixture-project');
  const out = path.join(target, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  await writeAgentDocs({ outDir: out, clean: true, targetRoot: target, map: createMinimalMap() });
  const context = await fs.readFile(path.join(out, 'AGENT_CONTEXT.md'), 'utf8');
  const budget = await fs.readFile(path.join(out, 'BUDGET.md'), 'utf8');
  assert.equal(context.endsWith('\n'), true);

  const expectedLineCount = context.split('\n').length - 1;
  const budgetRow = budget.match(/^\| `AGENT_CONTEXT\.md` \| (\d+) \|/m);
  assert.ok(budgetRow, 'BUDGET.md must include AGENT_CONTEXT.md');
  assert.equal(Number(budgetRow[1]), expectedLineCount);
});

test('AGENT_CONTEXT.md renders the source commit from the real generated shape', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-commit-'));
  const target = path.join(sandbox, 'fixture-project');
  const out = path.join(target, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  const commit = '0123456789abcdef0123456789abcdef01234567';
  const realMap = buildAgentMap({
    projectName: 'FixtureProject',
    targetRoot: target,
    generatedBy: 'AgentDocMap',
    sourceMetadata: 'git',
    generatedAtUtc: 'example',
    git: { commit, commitDate: '2024-01-01T00:00:00Z', branch: 'main', dirty: true },
    packageJson: null,
    sourceAnalysis: { files: [] },
    doclets: [],
  });

  // The fixture must use the field names buildAgentMap actually emits; otherwise
  // formatSourceCommit silently falls back to 'unknown' and the rendering goes untested.
  const fixture = createMinimalMap();
  assert.deepEqual(Object.keys(fixture.generated).sort(), Object.keys(realMap.generated).sort());
  assert.equal(realMap.generated.sourceCommit, commit);
  assert.equal(realMap.generated.sourceDirty, true);

  fixture.generated.sourceCommit = commit;
  fixture.generated.sourceDirty = true;

  // The dirty marker's parentheses are Markdown-escaped by escapeMarkdownInline.
  const expectedLine = `Source commit: ${commit} \\(dirty\\)`;
  const sourceCommitLine = (context) => context.split('\n').find((line) => line.startsWith('Source commit:'));

  try {
    await writeAgentDocs({ outDir: out, clean: true, targetRoot: target, map: fixture });
    const context = await fs.readFile(path.join(out, 'AGENT_CONTEXT.md'), 'utf8');
    assert.equal(sourceCommitLine(context), expectedLine);

    await writeAgentDocs({ outDir: out, clean: true, targetRoot: target, map: realMap });
    const realContext = await fs.readFile(path.join(out, 'AGENT_CONTEXT.md'), 'utf8');
    assert.equal(sourceCommitLine(realContext), expectedLine);
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }
});

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
    { packageName: 'dev-dynamic', importCount: 9, dynamicImportCount: 9, files: manyFiles },
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
    assert.equal(rows['five-files'].includes('files total'), false);
    assert.equal(rows['five-files'].includes('<code>src/file-5.js</code> |'), true);
    // Import count differs from the file count while every file is listed: the
    // file total is stated so the Imports column cannot be misread as a file count.
    assert.equal(
      rows['mixed-kinds'],
      '| <code>mixed-kinds</code> | <code>2.0.0</code> | 3 (1 dynamic) | <code>src/a.js</code><br><code>src/b.js</code><br>(2 files total) |',
    );
    assert.equal(rows['only-dynamic'].includes('| 2 (dynamic) | <code>src/c.js</code><br>(1 file total) |'), true);
    // Development dependencies have no Used In column, even with many files;
    // this eight-file case must preserve the three-column row and its dynamic
    // import count, without applying the runtime-only file truncation formatter.
    assert.equal(rows['dev-dynamic'], '| <code>dev-dynamic</code> | <code>5.0.0</code> | 9 (dynamic) |');
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }
});

test('DEPENDENCIES.md distinguishes missing usage data from zero observed files in the Used In cell', async () => {
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
  // 'no-usage-entry' and 'dev-no-usage-entry' have no packageUsage entry at all (usage is undefined)
  // and must render a dash; 'empty-usage' has an entry with zero observed imports and no files
  // and must render an empty cell, so the two cases stay distinguishable in the table.
  map.packageUsage = [
    { packageName: 'empty-usage', importCount: 0, dynamicImportCount: 0, files: [] },
  ];

  try {
    await writeAgentDocs({ outDir: out, clean: true, targetRoot: target, map });
    const dependencies = await fs.readFile(path.join(out, 'DEPENDENCIES.md'), 'utf8');
    const rows = dependencies.split('\n').filter((line) => line.startsWith('| <code>'));

    assert.deepEqual(rows, [
      '| <code>empty-usage</code> | <code>2.0.0</code> | 0 |  |',
      '| <code>no-usage-entry</code> | <code>1.0.0</code> | 0 | — |',
      '| <code>dev-no-usage-entry</code> | <code>3.0.0</code> | 0 |',
    ]);
    assert.notEqual(rows[0].split(' | ')[3], rows[1].split(' | ')[3]);
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }
});

test('DEPENDENCIES.md does not treat Object.prototype member names as declared packages', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-deps-'));
  const target = path.join(sandbox, 'fixture-project');
  const out = path.join(target, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  const map = createMinimalMap();
  map.project.dependencies = { declared: '1.0.0' };
  map.packageUsage = [
    { packageName: 'constructor', importCount: 1, dynamicImportCount: 0, files: ['src/a.js'] },
    { packageName: 'toString', importCount: 1, dynamicImportCount: 0, files: ['src/b.js'] },
    { packageName: 'declared', importCount: 1, dynamicImportCount: 0, files: ['src/c.js'] },
  ];

  try {
    await writeAgentDocs({ outDir: out, clean: true, targetRoot: target, map });
    const dependencies = await fs.readFile(path.join(out, 'DEPENDENCIES.md'), 'utf8');
    const undeclared = dependencies.split('\n').filter((line) => line.startsWith('- `'));

    assert.deepEqual(undeclared, [
      '- `constructor`: 1 imports in 1 files',
      '- `toString`: 1 imports in 1 files',
    ]);
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }
});

test('writeAgentDocs rejects cleaning the target repository root even when the name is allowlisted', async (t) => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  t.after(() => fs.rm(sandbox, { recursive: true, force: true }));
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

test('writeAgentDocs rejects cleaning an allowlisted ancestor of the target repository root', async (t) => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  t.after(() => fs.rm(sandbox, { recursive: true, force: true }));
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

test('writeAgentDocs still allows writing to docs-agent inside the target repository root', async (t) => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  t.after(() => fs.rm(sandbox, { recursive: true, force: true }));
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

async function directoryExists(candidate) {
  try {
    return (await fs.stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

test('writeAgentDocs rejects cleaning common system directories', async (t) => {
  // The home directory is always protected by the guard and always exists, so the
  // test never depends on host environment variables or on a fixed POSIX layout.
  // Platform system directories are added only when this host actually has them.
  const systemCandidates = process.platform === 'win32'
    ? [process.env.ProgramData, process.env.SystemRoot]
    : ['/usr'];
  const outDirs = [os.homedir()];
  for (const candidate of systemCandidates) {
    if (candidate && await directoryExists(candidate)) {
      outDirs.push(candidate);
    }
  }
  if (process.platform === 'win32' && outDirs.length === 1) {
    // Report missing host directories explicitly instead of silently passing with home-only coverage.
    t.diagnostic('WARNING: Reduced system-directory guard coverage: neither ProgramData nor SystemRoot identifies an existing directory; only the home directory is tested.');
  }

  for (const outDir of outDirs) {
    await assert.rejects(
      writeAgentDocs({
        outDir,
        clean: true,
        targetRoot: path.join(os.tmpdir(), 'agentdocmap-target'),
        map: createMinimalMap(),
      }),
      /Refusing to clean unsafe AgentDocMap output directory/,
      `expected the guard to reject ${outDir}`,
    );
  }
});
