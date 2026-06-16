import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRelativePath } from './fsUtils.js';

const DEFAULT_INCLUDE = ['src', 'server'];
const DEFAULT_INCLUDE_PATTERN = /\.(js|jsx|mjs|cjs)$/i;
const DEFAULT_EXCLUDE_PATTERN = /(node_modules|dist|docs|coverage|\.git)\//i;

export async function collectSourceFiles({ targetRoot, jsdocConfig }) {
  const includes = normalizeIncludes(jsdocConfig?.source?.include);
  const includePattern = toRegex(jsdocConfig?.source?.includePattern, DEFAULT_INCLUDE_PATTERN);
  const excludePattern = toRegex(jsdocConfig?.source?.excludePattern, DEFAULT_EXCLUDE_PATTERN);
  const files = [];

  for (const include of includes) {
    const absolute = path.resolve(targetRoot, include);
    await walk(absolute, async (filePath) => {
      const relative = normalizeRelativePath(targetRoot, filePath);
      if (includePattern.test(filePath) && !excludePattern.test(`${relative}/`)) {
        files.push({ absolutePath: filePath, relativePath: relative });
      }
    });
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function normalizeIncludes(value) {
  if (Array.isArray(value) && value.length > 0) {
    return value;
  }

  return DEFAULT_INCLUDE;
}

function toRegex(value, fallback) {
  if (!value) {
    return fallback;
  }

  return new RegExp(value);
}

async function walk(startPath, onFile) {
  let entries;
  try {
    entries = await fs.readdir(startPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(startPath, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'docs', 'coverage', '.git'].includes(entry.name)) {
        await walk(fullPath, onFile);
      }
    } else if (entry.isFile()) {
      await onFile(fullPath);
    }
  }
}
