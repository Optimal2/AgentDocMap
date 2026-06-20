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
