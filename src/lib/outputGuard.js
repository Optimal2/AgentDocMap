import os from 'node:os';
import path from 'node:path';

const ALLOWED_OUTPUT_DIRECTORY_NAMES = new Set(['docs-agent']);
const ALLOWED_OUTPUT_DIRECTORY_SUFFIX = '-agent-docs';
const TEMP_OUTPUT_DIRECTORY_PREFIX = 'agentdocmap-';
const POSIX_SENSITIVE_OUTPUT_PATHS = [
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/lib64',
  '/opt',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/srv',
  '/sys',
  '/usr',
  '/var',
];
const WINDOWS_SENSITIVE_OUTPUT_PATHS = [
  process.env.LOCALAPPDATA,
  process.env.APPDATA,
  process.env.ProgramData,
  process.env.ProgramFiles,
  process.env['ProgramFiles(x86)'],
  process.env.SystemRoot,
  process.env.SystemDrive ? `${process.env.SystemDrive}${path.sep}` : null,
];

function normalizePathForComparison(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isSameOrAncestorPath(candidateAncestor, candidateDescendant) {
  const relativePath = path.relative(
    normalizePathForComparison(candidateAncestor),
    normalizePathForComparison(candidateDescendant),
  );
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function collectSensitiveOutputPaths(targetRoot) {
  return new Set([
    path.parse(process.cwd()).root,
    process.cwd(),
    process.env.HOME,
    process.env.USERPROFILE,
    os.homedir(),
    path.parse(os.homedir()).root,
    ...POSIX_SENSITIVE_OUTPUT_PATHS,
    ...WINDOWS_SENSITIVE_OUTPUT_PATHS,
    targetRoot,
    targetRoot ? path.parse(targetRoot).root : null,
  ].filter(Boolean).map(normalizePathForComparison));
}

export function assertSafeCleanOutputDirectory(outDir, targetRoot) {
  const resolved = path.resolve(outDir);
  const normalized = normalizePathForComparison(resolved);
  const directoryName = path.basename(resolved);
  const tempRoot = normalizePathForComparison(os.tmpdir());
  const sensitiveOutputPaths = collectSensitiveOutputPaths(targetRoot);
  const isAllowedNamedOutput = ALLOWED_OUTPUT_DIRECTORY_NAMES.has(directoryName)
    || (directoryName.endsWith(ALLOWED_OUTPUT_DIRECTORY_SUFFIX) && /^[a-z0-9._-]+$/i.test(directoryName));
  const isAllowedTemporaryOutput = directoryName.startsWith(TEMP_OUTPUT_DIRECTORY_PREFIX)
    && normalizePathForComparison(path.dirname(resolved)) === tempRoot;

  if (targetRoot && isSameOrAncestorPath(resolved, targetRoot)) {
    throw new Error(`Refusing to clean AgentDocMap output directory because it overlaps the target repository root: ${resolved}`);
  }

  if (sensitiveOutputPaths.has(normalized) || (!isAllowedNamedOutput && !isAllowedTemporaryOutput)) {
    throw new Error(`Refusing to clean unsafe AgentDocMap output directory: ${resolved}`);
  }
}
