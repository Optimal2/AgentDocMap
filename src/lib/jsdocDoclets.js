import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathExists } from './fsUtils.js';

export async function collectJsdocDoclets({ projectRoot, targetRoot, jsdocConfigPath }) {
  const jsdocCli = path.join(projectRoot, 'node_modules', 'jsdoc', 'jsdoc.js');
  if (!(await pathExists(jsdocCli))) {
    throw new Error('JSDoc is not installed. Run npm install in the AgentDocMap repository.');
  }

  const args = [jsdocCli, '-X'];
  if (await pathExists(jsdocConfigPath)) {
    args.push('-c', jsdocConfigPath);
  } else {
    args.push('src');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: targetRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 80,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`JSDoc failed with exit code ${result.status}.\n${detail}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Unable to parse JSDoc JSON output: ${error instanceof Error ? error.message : String(error)}`);
  }
}
