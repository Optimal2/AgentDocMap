import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { getGitInfo } from '../src/lib/gitInfo.js';
import { withTempDir } from './testUtils.js';

test('getGitInfo reports unknown dirty status when Git cannot read the target', async () => {
  await withTempDir('agentdocmap-git-', async (target) => {
    for (const cwd of [target, path.join(target, 'missing')]) {
      assert.deepEqual(await getGitInfo(cwd), {
        commit: null, commitDate: null, branch: null, dirty: null,
      });
    }
  });
});
