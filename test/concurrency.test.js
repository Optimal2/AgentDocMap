import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { generateAgentDocs } from '../src/index.js';
import { withTempDir } from './testUtils.js';

function assertIsAgentDocResult(result, index) {
  assert.equal(typeof result, 'object', `run ${index} should return a result object`);
  assert.notEqual(result, null, `run ${index} should return a non-null result`);
  assert.equal(typeof result.stats, 'object', `run ${index} should include stats`);
  assert.notEqual(result.stats, null, `run ${index} stats should be non-null`);
  assert.equal(result.stats.fileCount, 2, `run ${index} should inspect the fixture files`);
}

function formatSettledFailureDiagnostics(results) {
  return results
    .map((result, index) => {
      if (result.status === 'fulfilled') {
        return null;
      }

      const reason = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      return `run ${index}: ${reason}`;
    })
    .filter(Boolean)
    .join('; ');
}

test('generateAgentDocs produces deterministic output across isolated parallel runs', async () => {
  await withTempDir('agentdocmap-concurrency-', async (sandbox) => {
    const target = path.resolve('test/fixture-project');
    const count = 5;
    const outDirs = Array.from({ length: count }, (_, index) =>
      path.join(sandbox, `fixture-${index}-agent-docs`),
    );

    const results = await Promise.all(
      outDirs.map((out) =>
        generateAgentDocs({
          target,
          out,
          projectName: 'FixtureProject',
        }),
      ),
    );

    assert.equal(results.length, count);
    results.forEach(assertIsAgentDocResult);

    const firstContext = await fs.readFile(path.join(outDirs[0], 'AGENT_CONTEXT.md'), 'utf8');
    const firstMap = JSON.parse(await fs.readFile(path.join(outDirs[0], 'agent-map.json'), 'utf8'));

    for (let index = 1; index < count; index += 1) {
      const context = await fs.readFile(path.join(outDirs[index], 'AGENT_CONTEXT.md'), 'utf8');
      assert.equal(context, firstContext, `run ${index} produced different AGENT_CONTEXT.md`);

      const map = JSON.parse(await fs.readFile(path.join(outDirs[index], 'agent-map.json'), 'utf8'));
      assert.deepEqual(map, firstMap, `run ${index} produced different agent-map.json`);
    }
  });
});

test('concurrent same-directory runs complete without crashing the process', async () => {
  await withTempDir('agentdocmap-concurrency-', async (sandbox) => {
    const target = path.resolve('test/fixture-project');
    const out = path.join(sandbox, 'shared-agent-docs');
    const count = 4;

    const results = await Promise.allSettled(
      Array.from({ length: count }, () =>
        generateAgentDocs({
          target,
          out,
          projectName: 'FixtureProject',
        }),
      ),
    );

    // Concurrent writes to the same output directory are not guaranteed to
    // succeed because each run deletes and recreates the directory. This test
    // only verifies that the process remains stable and does not throw
    // unhandled errors.
    const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
    const failureDiagnostics = formatSettledFailureDiagnostics(results);
    assert.ok(
      fulfilled > 0,
      `at least one concurrent run should complete. Failures: ${failureDiagnostics || 'none'}`,
    );
  });
});
