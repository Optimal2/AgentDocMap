import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function formatCleanupError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * Creates a temporary directory with the provided prefix, passes its path to
 * the callback, and removes the directory recursively after the callback exits.
 *
 * @param {string} prefix - Prefix for the temporary directory name.
 * @param {(dir: string) => Promise<*>} callback - Callback that receives the temporary directory path.
 * @returns {Promise<*>} The result returned by the callback.
 */
export async function withTempDir(prefix, callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  let callbackFailed = false;
  try {
    return await callback(dir);
  } catch (error) {
    callbackFailed = true;
    throw error;
  } finally {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (cleanupError) {
      if (callbackFailed) {
        console.warn(
          `Failed to remove temporary test directory "${dir}": ${formatCleanupError(cleanupError)}`,
        );
      } else {
        throw cleanupError;
      }
    }
  }
}
