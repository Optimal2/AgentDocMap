import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertSafeCleanOutputDirectory } from '../src/lib/outputGuard.js';

test('assertSafeCleanOutputDirectory rejects cleaning the target repository root even when the name is allowlisted', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  const target = path.join(sandbox, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  assert.throws(
    () => assertSafeCleanOutputDirectory(target, target),
    /overlaps the target repository root/,
  );
});

test('assertSafeCleanOutputDirectory rejects cleaning an allowlisted ancestor of the target repository root', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  const out = path.join(sandbox, 'docs-agent');
  const target = path.join(out, 'fixture-project');
  await fs.mkdir(target, { recursive: true });

  assert.throws(
    () => assertSafeCleanOutputDirectory(out, target),
    /overlaps the target repository root/,
  );
});

test('assertSafeCleanOutputDirectory allows cleaning docs-agent inside the target repository root', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  const target = path.join(sandbox, 'fixture-project');
  const out = path.join(target, 'docs-agent');
  await fs.mkdir(target, { recursive: true });

  assert.doesNotThrow(() => assertSafeCleanOutputDirectory(out, target));
});

test('assertSafeCleanOutputDirectory rejects cleaning common system directories', () => {
  const outDir = process.platform === 'win32'
    ? (process.env.ProgramData || process.env.SystemRoot)
    : '/usr';

  assert.throws(
    () => assertSafeCleanOutputDirectory(outDir, path.join(os.tmpdir(), 'agentdocmap-target')),
    /Refusing to clean unsafe AgentDocMap output directory/,
  );
});

test('assertSafeCleanOutputDirectory allows cleaning a temporary agentdocmap-prefixed directory', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-'));

  assert.doesNotThrow(
    () => assertSafeCleanOutputDirectory(out, path.join(os.tmpdir(), 'agentdocmap-target')),
  );
});

test('assertSafeCleanOutputDirectory rejects cleaning a temporary-prefixed directory outside the temp root', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  const out = path.join(sandbox, 'agentdocmap-example');
  await fs.mkdir(out, { recursive: true });

  assert.throws(
    () => assertSafeCleanOutputDirectory(out, path.join(os.tmpdir(), 'agentdocmap-target')),
    /Refusing to clean unsafe AgentDocMap output directory/,
  );
});

test('assertSafeCleanOutputDirectory rejects cleaning an arbitrary directory name outside the target repo', async () => {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdocmap-guard-'));
  const out = path.join(sandbox, 'some-random-folder');
  await fs.mkdir(out, { recursive: true });

  assert.throws(
    () => assertSafeCleanOutputDirectory(out, path.join(os.tmpdir(), 'agentdocmap-target')),
    /Refusing to clean unsafe AgentDocMap output directory/,
  );
});
