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
