import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { getGitInfo } from '../src/lib/gitInfo.js';
import { withTempDir } from './testUtils.js';

const execFileAsync = promisify(execFile);

test('getGitInfo reports unknown dirty status when Git cannot read the target', async () => {
  await withTempDir('agentdocmap-git-', async (target) => {
    for (const cwd of [target, path.join(target, 'missing')]) {
      assert.deepEqual(await getGitInfo(cwd), {
        commit: null, commitDate: null, branch: null, dirty: null,
      });
    }
  });
});

test('getGitInfo disables fsmonitor commands from the target Git configuration', async () => {
  await withTempDir('agentdocmap-git-config-', async (target) => {
    const marker = path.join(target, 'fsmonitor-ran');
    const script = path.join(target, 'fsmonitor.js');
    await fs.writeFile(
      script,
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n`,
      'utf8',
    );
    await execFileAsync('git', ['init', '--quiet'], { cwd: target, windowsHide: true });
    const command = [process.execPath, script]
      .map((value) => `"${value.replaceAll('\\', '/')}"`)
      .join(' ');
    await execFileAsync('git', ['config', 'core.fsmonitor', command], { cwd: target, windowsHide: true });

    await getGitInfo(target);

    await assert.rejects(fs.access(marker), { code: 'ENOENT' });
  });
});
