import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { analyzeSources } from '../src/lib/sourceAnalyzer.js';
import { withTempDir } from './testUtils.js';

test('analyzeSources reports recovered Babel syntax errors and continues analysis', async () => {
  await withTempDir('agentdocmap-parser-', async (targetRoot) => {
    const absolutePath = path.join(targetRoot, 'src', 'broken.js');
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(
      absolutePath,
      'export const duplicate = 1;\nexport const duplicate = 2;\nexport const after = 3;\n',
      'utf8',
    );

    const { files } = await analyzeSources({
      targetRoot,
      sourceFiles: [{ absolutePath, relativePath: 'src/broken.js' }],
    });

    assert.equal(files.length, 1);
    assert.equal(typeof files[0].parseError, 'string');
    assert.ok(files[0].parseError.length > 0);
    assert.equal(files[0].exports.some((item) => item.name === 'after'), true);
  });
});
