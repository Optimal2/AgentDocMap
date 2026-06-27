import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateAgentDocs } from '../src/index.js';

async function withTempDir(prefix, callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
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

    assert.equal(results.every((result) => result.stats.fileCount === 2), true);

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
    assert.equal(fulfilled > 0, true, 'at least one concurrent run should complete');
  });
});
