import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateAgentDocs } from '../src/index.js';

test('generateAgentDocs writes an agent packet from existing JSDoc comments', async () => {
  const target = path.resolve('test/fixture-project');
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-'));

  const result = await generateAgentDocs({
    target,
    out,
    projectName: 'FixtureProject',
  });

  assert.equal(result.stats.fileCount, 2);
  assert.equal(result.stats.docletCount >= 2, true);

  const context = await fs.readFile(path.join(out, 'AGENT_CONTEXT.md'), 'utf8');
  assert.match(context, /FixtureProject Agent Context/);

  const symbolIndex = JSON.parse(await fs.readFile(path.join(out, 'symbol-index.json'), 'utf8'));
  assert.equal(symbolIndex.some((symbol) => symbol.name === 'double'), true);
});
