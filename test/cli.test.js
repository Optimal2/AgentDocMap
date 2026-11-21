import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs } from '../src/cli.js';

test('parseArgs parses a full generate command', () => {
  const { command, options } = parseArgs([
    'generate',
    '--target',
    't',
    '--out',
    'o',
    '--project-name',
    'P',
    '--generated-at',
    'g',
    '--source-metadata',
    'none',
    '--no-clean',
  ]);

  assert.equal(command, 'generate');
  assert.deepEqual(options, {
    clean: false,
    target: 't',
    out: 'o',
    projectName: 'P',
    generatedAt: 'g',
    sourceMetadata: 'none',
  });
});

test('parseArgs rejects an option value that is another option', () => {
  assert.throws(
    () => parseArgs(['generate', '--target', 't', '--out', '--no-clean']),
    /Missing value for option: --out/,
  );
  assert.throws(
    () => parseArgs(['generate', '--target', '--out', 'o']),
    /Missing value for option: --target/,
  );
});

test('parseArgs rejects a trailing option without a value', () => {
  assert.throws(() => parseArgs(['generate', '--target', 't', '--out']), /Missing value for option: --out/);
  assert.throws(() => parseArgs(['generate', '--target']), /Missing value for option: --target/);
});

test('parseArgs still rejects unknown arguments', () => {
  assert.throws(() => parseArgs(['generate', '--bogus']), /Unknown argument: --bogus/);
});
