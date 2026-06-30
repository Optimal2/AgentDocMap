import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function withTempDir(prefix, callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
