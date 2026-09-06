import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateAgentDocs } from '../src/index.js';
import { buildAgentMap } from '../src/lib/mapBuilder.js';
import { writeAgentDocs } from '../src/lib/writers.js';

// Mirrors the `generated` block produced by buildAgentMap (src/lib/mapBuilder.js);
// the key set is asserted against the real builder below so the fixture cannot drift.
function createGeneratedFixture() {
  return {
    by: 'AgentDocMap',
    atUtc: 'example',
    sourceMetadata: 'none',
    sourceCommit: null,
    sourceBranch: null,
    sourceDirty: false,
  };
}

test('the generated fixture uses the field names buildAgentMap emits', () => {
  const realMap = buildAgentMap({
    projectName: 'FixtureProject',
    targetRoot: path.join(os.tmpdir(), 'agentdocmap-target'),
    generatedBy: 'AgentDocMap',
    sourceMetadata: 'none',
    generatedAtUtc: 'example',
    git: { commit: null, commitDate: null, branch: null, dirty: null },
    packageJson: null,
    sourceAnalysis: { files: [] },
    doclets: [],
  });

  assert.deepEqual(
    Object.keys(createGeneratedFixture()).sort(),
    Object.keys(realMap.generated).sort(),
  );
});

test('generateAgentDocs writes an agent packet from existing JSDoc comments', async () => {
  const target = path.resolve('test/fixture-project');
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-'));

  const result = await generateAgentDocs({
    target,
    out,
    projectName: 'FixtureProject',
  });

  assert.equal(result.stats.fileCount, 3);
  assert.equal(result.stats.docletCount >= 3, true);

  const context = await fs.readFile(path.join(out, 'AGENT_CONTEXT.md'), 'utf8');
  assert.match(context, /FixtureProject Agent Context/);
  assert.match(context, /CROSS_CUTTING\.md/);
  assert.match(context, /BUDGET\.md/);

  const fileMap = await fs.readFile(path.join(out, 'FILE_MAP.md'), 'utf8');
  assert.match(fileMap, /\| File \| Lines \| In \| JSDoc \| Confidence \| Summary \|/);

  const budget = await fs.readFile(path.join(out, 'BUDGET.md'), 'utf8');
  assert.match(budget, /Estimated output tokens/);

  const crossCutting = await fs.readFile(path.join(out, 'CROSS_CUTTING.md'), 'utf8');
  assert.match(crossCutting, /Cross-Cutting Index/);

  const symbolIndex = JSON.parse(await fs.readFile(path.join(out, 'symbol-index.json'), 'utf8'));
  assert.equal(symbolIndex.some((symbol) => symbol.name === 'double'), true);

  const agentMap = JSON.parse(await fs.readFile(path.join(out, 'agent-map.json'), 'utf8'));
  assert.equal(agentMap.files.every((file) => typeof file.summaryConfidence === 'string'), true);
  assert.equal(agentMap.stats.sourceLineCount > 0, true);
  assert.equal(agentMap.stats.estimatedSourceTokens > 0, true);
});

test('generateAgentDocs counts constant-specifier dynamic imports like static imports', async () => {
  const target = path.resolve('test/fixture-project');
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-'));

  await generateAgentDocs({
    target,
    out,
    projectName: 'FixtureProject',
  });

  const agentMap = JSON.parse(await fs.readFile(path.join(out, 'agent-map.json'), 'utf8'));
  const lazy = agentMap.files.find((file) => file.path === 'src/lazy.js');
  assert.ok(lazy, 'expected src/lazy.js in the analyzed files');
  assert.deepEqual(
    lazy.imports.map((item) => [item.source, item.kind]),
    [
      ['./math.js', 'static'],
      ['lazy-formatter', 'dynamic'],
      ['./math.js', 'dynamic'],
    ],
  );
  assert.equal(lazy.packageImports.length, 1);
  assert.equal(lazy.packageImports[0].kind, 'dynamic');
  assert.equal(lazy.localImports.length, 2);
  assert.equal(lazy.localImports.every((item) => item.resolved === 'src/math.js'), true);

  const math = agentMap.files.find((file) => file.path === 'src/math.js');
  assert.equal(math.incomingLocalImports, 3);

  const usage = agentMap.packageUsage.find((item) => item.packageName === 'lazy-formatter');
  assert.deepEqual(usage, {
    packageName: 'lazy-formatter',
    importCount: 1,
    dynamicImportCount: 1,
    files: ['src/lazy.js'],
  });

  const dependencies = await fs.readFile(path.join(out, 'DEPENDENCIES.md'), 'utf8');
  assert.match(dependencies, /- `lazy-formatter`: 1 imports in 1 files/);
});

test('writeAgentDocs escapes Markdown-sensitive inline values', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-'));

  await writeAgentDocs({
    outDir,
    clean: true,
    targetRoot: path.join(os.tmpdir(), 'agentdocmap-target'),
    map: {
      project: {
        name: 'Fixture *Project*',
        packageName: 'fixture-[pkg]',
        packageVersion: '1.0.0',
        description: 'Desc *bold* <tag>\nsecond line',
        dependencies: {
          'pkg|name': '1.0.0|beta',
        },
        devDependencies: {},
        packageScripts: {
          start: 'node -e "console.log(`hi`)"',
        },
      },
      generated: createGeneratedFixture(),
      stats: {
        fileCount: 1,
        sourceLineCount: 10,
        docletCount: 1,
        documentedFileCount: 1,
        lowConfidenceSummaryCount: 1,
        parseErrorCount: 1,
        estimatedSourceTokens: 123,
      },
      importantFiles: [
        {
          path: 'src/a|b.js',
          summary: 'Summary with `code` and [link](x) <b>tag</b>',
        },
      ],
      recommendations: [
        'Do *not* trust <b>raw</b> text',
      ],
      crossCutting: {
        roles: [
          {
            role: 'hook',
            files: [
              {
                path: 'src/index.js',
                lines: 10,
                summary: 'Role summary with `ticks` and _emphasis_',
              },
            ],
          },
        ],
        riskPatterns: [
          {
            key: 'danger-*',
            description: 'Risky <tag> [desc](x)',
            files: [
              {
                path: 'src/index.js',
                lines: [1, 2],
                summary: 'Pattern summary with # heading',
              },
            ],
          },
        ],
      },
      packageUsage: [
        {
          packageName: 'pkg|name',
          importCount: 1,
          files: ['src/a|b.js'],
        },
      ],
      files: [
        {
          path: 'src/a|b.js',
          lines: 10,
          incomingLocalImports: 2,
          doclets: [
            {
              longname: 'module:foo|bar',
              name: 'foo',
              kind: 'function',
              description: 'Doclet *summary* <x>',
            },
          ],
          summaryConfidence: 'low',
          summary: 'File summary with `code` and <tag>',
          parseError: 'Unexpected `token` <bad>',
          exports: [{ name: 'foo' }],
          localImports: [{ resolved: 'src/dep|pipe.js' }],
          moduleKey: 'root*module*',
        },
      ],
      symbols: [
        {
          longname: 'module:foo|bar',
          name: 'foo',
          kind: 'function',
          file: 'src/a|b.js',
          line: 1,
          description: 'Doclet *summary* <x>',
        },
      ],
      modules: [
        {
          name: 'root*module*',
          fileCount: 1,
          lineCount: 10,
          docletCount: 1,
          importantFiles: [
            {
              path: 'src/a|b.js',
              summary: 'Module file summary with [x]',
            },
          ],
        },
      ],
    },
  });

  const context = await fs.readFile(path.join(outDir, 'AGENT_CONTEXT.md'), 'utf8');
  assert.equal(context.includes('# Fixture \\*Project\\* Agent Context'), true);
  assert.equal(context.includes('Description: Desc \\*bold\\* &lt;tag&gt; second line'), true);
  assert.equal(context.includes('Summary with \\`code\\` and \\[link\\]\\(x\\) &lt;b&gt;tag&lt;/b&gt;'), true);
  assert.equal(context.includes('Do \\*not\\* trust &lt;b&gt;raw&lt;/b&gt; text'), true);
  assert.equal(context.includes('Desc *bold* <tag>'), false);
  assert.equal(context.includes('`src/a|b.js`'), true);

  const crossCutting = await fs.readFile(path.join(outDir, 'CROSS_CUTTING.md'), 'utf8');
  assert.equal(crossCutting.includes('Role summary with \\`ticks\\` and \\_emphasis\\_'), true);
  assert.equal(crossCutting.includes('Risky &lt;tag&gt; \\[desc\\]\\(x\\).'), true);
  assert.equal(crossCutting.includes('Pattern summary with \\# heading'), true);

  const entrypoints = await fs.readFile(path.join(outDir, 'ENTRYPOINTS.md'), 'utf8');
  assert.equal(entrypoints.includes('``node -e "console.log(`hi`)"``'), true);
  assert.equal(entrypoints.includes('## Runtime Entrypoints'), true);

  const fileMap = await fs.readFile(path.join(outDir, 'FILE_MAP.md'), 'utf8');
  assert.equal(fileMap.includes('Unexpected \\`token\\` &lt;bad&gt;'), true);
  assert.equal(fileMap.includes('<code>src/a&#124;b.js</code>'), true);

  const modules = await fs.readFile(path.join(outDir, 'MODULES.md'), 'utf8');
  assert.equal(modules.includes('## root\\*module\\*'), true);
  assert.equal(modules.includes('Module file summary with \\[x\\]'), true);

  const dependencies = await fs.readFile(path.join(outDir, 'DEPENDENCIES.md'), 'utf8');
  assert.equal(dependencies.includes('<code>pkg&#124;name</code>'), true);
  assert.equal(dependencies.includes('<code>1.0.0&#124;beta</code>'), true);
  assert.equal(dependencies.includes('<code>src/a&#124;b.js</code>'), true);

  const symbolIndex = await fs.readFile(path.join(outDir, 'SYMBOL_INDEX.md'), 'utf8');
  assert.equal(symbolIndex.includes('<code>module:foo&#124;bar</code>'), true);
  assert.equal(symbolIndex.includes('<code>src/a&#124;b.js:1</code>'), true);

  const chunk = await fs.readFile(path.join(outDir, 'chunks', 'root_module_.md'), 'utf8');
  assert.equal(chunk.includes('# Fixture \\*Project\\* / root\\*module\\*'), true);
  assert.equal(chunk.includes('File summary with \\`code\\` and &lt;tag&gt;'), true);
  assert.equal(chunk.includes('Doclet \\*summary\\* &lt;x&gt;'), true);
});
