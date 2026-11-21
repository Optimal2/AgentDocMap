import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function getGitInfo(cwd) {
  const [commit, commitDate, branch, status] = await Promise.all([
    git(cwd, ['rev-parse', 'HEAD']),
    git(cwd, ['show', '-s', '--format=%cI', 'HEAD']),
    git(cwd, ['branch', '--show-current']),
    git(cwd, ['status', '--short']),
  ]);

  return {
    commit: commit || null,
    commitDate: commitDate || null,
    branch: branch || null,
    dirty: status === null ? null : Boolean(status),
  };
}

async function git(cwd, args) {
  try {
    const result = await execFileAsync('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd,
      windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    return result.stdout.trim();
  } catch {
    return null;
  }
}
