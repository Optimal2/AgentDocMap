import fs from 'node:fs/promises';
import path from 'node:path';

export function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonIfExists(filePath) {
  if (!(await pathExists(filePath))) {
    return null;
  }

  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

export async function readTextIfExists(filePath) {
  if (!(await pathExists(filePath))) {
    return null;
  }

  return fs.readFile(filePath, 'utf8');
}

export function normalizeRelativePath(targetRoot, absolutePath) {
  return toPosixPath(path.relative(targetRoot, absolutePath));
}

export function truncateText(value, maxLength = 220) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function firstSentence(value, maxLength = 180) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.+?[.!?])\s/);
  return truncateText(match ? match[1] : normalized, maxLength);
}
