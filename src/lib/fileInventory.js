import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRelativePath } from './fsUtils.js';

const DEFAULT_INCLUDE = ['src', 'server'];
const DEFAULT_INCLUDE_PATTERN = /\.(js|jsx|mjs|cjs)$/i;
const DEFAULT_EXCLUDE_PATTERN = /(node_modules|dist|docs|coverage|\.git)\//i;

const SENSITIVE_NAME_PATTERNS = [
  /^\.env/i,
  /\.(key|pem|p12|pfx|crt|cer|der|keystore|jks)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^(\.npmrc|\.yarnrc|\.pypirc|\.netrc|_netrc)$/i,
  /^(secret|secrets|credential|credentials|password|passwords|token|tokens)\./i,
  /\.local\.(json|js|mjs|cjs|yaml|yml|toml)$/i,
  /^\.localrc$/i,
];

const SENSITIVE_DIRECTORY_NAMES = new Set([
  '.env',
  'secrets',
  'secret',
  'credentials',
  'credential',
  'passwords',
  'password',
  'tokens',
  'token',
]);

export function isSensitiveFileName(fileName) {
  return SENSITIVE_NAME_PATTERNS.some((pattern) => pattern.test(fileName));
}

function isSensitiveDirectoryName(directoryName) {
  const lower = directoryName.toLowerCase();
  return SENSITIVE_DIRECTORY_NAMES.has(lower) || isSensitiveFileName(directoryName);
}

export async function collectSourceFiles({ targetRoot, jsdocConfig }) {
  const includes = normalizeIncludes(jsdocConfig?.source?.include);
  const includePattern = toRegex(jsdocConfig?.source?.includePattern, DEFAULT_INCLUDE_PATTERN);
  const excludePattern = toRegex(jsdocConfig?.source?.excludePattern, DEFAULT_EXCLUDE_PATTERN);
  const files = [];

  for (const include of includes) {
    const absolute = path.resolve(targetRoot, include);
    await walk(absolute, async (filePath) => {
      const relative = normalizeRelativePath(targetRoot, filePath);
      const fileName = path.basename(filePath);
      if (includePattern.test(filePath) && !excludePattern.test(`${relative}/`) && !isSensitiveFileName(fileName)) {
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
      if (!['node_modules', 'dist', 'docs', 'coverage', '.git'].includes(entry.name) && !isSensitiveDirectoryName(entry.name)) {
        await walk(fullPath, onFile);
      }
    } else if (entry.isFile()) {
      await onFile(fullPath);
    }
  }
}
