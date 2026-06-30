import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertSafeCleanOutputDirectory } from '../src/lib/outputGuard.js';
import { withTempDir } from './testUtils.js';

async function assertDirectoryStillExists(directory) {
  const stats = await fs.stat(directory);
  assert.equal(stats.isDirectory(), true);
}

function getFallbackSensitiveOutputPath() {
  return path.parse(os.homedir()).root || path.parse(process.cwd()).root;
}

function getKnownSensitiveOutputPath() {
  if (process.platform === 'win32') {
    return process.env.ProgramData
      || process.env.SystemRoot
      || getFallbackSensitiveOutputPath();
  }

  if (['aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos'].includes(process.platform)) {
    return '/usr';
  }

  return getFallbackSensitiveOutputPath();
}

function assertRejectedAsUnsafeOrOverlapping(candidate, targetRoot) {
  assert.throws(
    () => assertSafeCleanOutputDirectory(candidate, targetRoot),
    /Refusing to clean (unsafe AgentDocMap output directory|AgentDocMap output directory because it overlaps the target repository root)/,
  );
}

test('assertSafeCleanOutputDirectory rejects cleaning the target repository root even when the name is allowlisted', async () => {
  await withTempDir('agentdocmap-guard-', async (sandbox) => {
    const target = path.join(sandbox, 'docs-agent');
    await fs.mkdir(target, { recursive: true });

    assert.throws(
      () => assertSafeCleanOutputDirectory(target, target),
      /overlaps the target repository root/,
    );
  });
});

test('assertSafeCleanOutputDirectory rejects cleaning an allowlisted ancestor of the target repository root', async () => {
  await withTempDir('agentdocmap-guard-', async (sandbox) => {
    const out = path.join(sandbox, 'docs-agent');
    const target = path.join(out, 'fixture-project');
    await fs.mkdir(target, { recursive: true });

    assert.throws(
      () => assertSafeCleanOutputDirectory(out, target),
      /overlaps the target repository root/,
    );
  });
});

test('assertSafeCleanOutputDirectory allows cleaning docs-agent inside the target repository root', async () => {
  await withTempDir('agentdocmap-guard-', async (sandbox) => {
    const target = path.join(sandbox, 'fixture-project');
    const out = path.join(target, 'docs-agent');
    await fs.mkdir(out, { recursive: true });

    assert.doesNotThrow(() => assertSafeCleanOutputDirectory(out, target));
    await assertDirectoryStillExists(out);
  });
});

test('assertSafeCleanOutputDirectory rejects cleaning common system directories', () => {
  const outDir = getKnownSensitiveOutputPath();

  assert.ok(outDir, `expected a sensitive output path for platform ${process.platform}`);
  assertRejectedAsUnsafeOrOverlapping(outDir, path.join(os.tmpdir(), 'agentdocmap-target'));
});

test('assertSafeCleanOutputDirectory rejects cleaning the current filesystem root', () => {
  const outDir = path.parse(process.cwd()).root;

  assertRejectedAsUnsafeOrOverlapping(outDir, path.join(os.tmpdir(), 'agentdocmap-target'));
});

test('assertSafeCleanOutputDirectory allows cleaning a temporary agentdocmap-prefixed directory', async () => {
  await withTempDir('agentdocmap-', async (out) => {
    assert.doesNotThrow(
      () => assertSafeCleanOutputDirectory(out, path.join(os.tmpdir(), 'agentdocmap-target')),
    );
    await assertDirectoryStillExists(out);
  });
});

test('assertSafeCleanOutputDirectory rejects cleaning a temporary-prefixed directory outside the temp root', async () => {
  await withTempDir('agentdocmap-guard-', async (sandbox) => {
    const out = path.join(sandbox, 'agentdocmap-example');
    await fs.mkdir(out, { recursive: true });

    assert.throws(
      () => assertSafeCleanOutputDirectory(out, path.join(os.tmpdir(), 'agentdocmap-target')),
      /Refusing to clean unsafe AgentDocMap output directory/,
    );
  });
});

test('assertSafeCleanOutputDirectory rejects cleaning an arbitrary directory name outside the target repo', async () => {
  await withTempDir('agentdocmap-guard-', async (sandbox) => {
    const out = path.join(sandbox, 'some-random-folder');
    await fs.mkdir(out, { recursive: true });

    assert.throws(
      () => assertSafeCleanOutputDirectory(out, path.join(os.tmpdir(), 'agentdocmap-target')),
      /Refusing to clean unsafe AgentDocMap output directory/,
    );
  });
});
