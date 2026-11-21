import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectJsdocDoclets } from '../src/lib/jsdocDoclets.js';
import { withTempDir } from './testUtils.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function writeTargetWithoutConfig(targetRoot) {
  await fs.mkdir(path.join(targetRoot, 'src', 'sub'), { recursive: true });
  await fs.mkdir(path.join(targetRoot, 'server'), { recursive: true });
  await fs.writeFile(
    path.join(targetRoot, 'src', 'sub', 'nested.js'),
    '/** Nested helper. */\nexport const nested = 1;\n',
  );
  await fs.writeFile(
    path.join(targetRoot, 'server', 'app.js'),
    '/** Server app. */\nexport const app = 1;\n',
  );
}

test('collectJsdocDoclets without jsdoc.json covers src subdirectories and server', async () => {
  await withTempDir('agentdocmap-jsdoc-', async (targetRoot) => {
    await writeTargetWithoutConfig(targetRoot);

    const doclets = await collectJsdocDoclets({
      projectRoot,
      targetRoot,
      jsdocConfigPath: path.join(targetRoot, 'jsdoc.json'),
    });

    const files = new Set(doclets.map((doclet) => doclet.meta?.filename).filter(Boolean));
    assert.equal(files.has('nested.js'), true, 'expected doclets from src/sub/nested.js');
    assert.equal(files.has('app.js'), true, 'expected doclets from server/app.js');
  });
});

test('collectJsdocDoclets without jsdoc.json returns no doclets when src and server are missing', async () => {
  await withTempDir('agentdocmap-jsdoc-', async (targetRoot) => {
    const doclets = await collectJsdocDoclets({
      projectRoot,
      targetRoot,
      jsdocConfigPath: path.join(targetRoot, 'jsdoc.json'),
    });

    assert.deepEqual(doclets, []);
  });
});
