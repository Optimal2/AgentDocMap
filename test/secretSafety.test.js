import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectSourceFiles, isSensitiveFileName } from '../src/lib/fileInventory.js';
import { buildAgentMap, redactScript } from '../src/lib/mapBuilder.js';
import { writeAgentDocs } from '../src/lib/writers.js';

async function withTempDir(prefix, callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }
}

test('isSensitiveFileName recognises common sensitive file names', () => {
  assert.equal(isSensitiveFileName('.env'), true);
  assert.equal(isSensitiveFileName('.env.local'), true);
  assert.equal(isSensitiveFileName('.env.production'), true);
  assert.equal(isSensitiveFileName('api.key'), true);
  assert.equal(isSensitiveFileName('cert.pem'), true);
  assert.equal(isSensitiveFileName('id_rsa'), true);
  assert.equal(isSensitiveFileName('id_rsa.pub'), true);
  assert.equal(isSensitiveFileName('.npmrc'), true);
  assert.equal(isSensitiveFileName('secrets.json'), true);
  assert.equal(isSensitiveFileName('config.local.js'), true);
  assert.equal(isSensitiveFileName('.localrc'), true);

  assert.equal(isSensitiveFileName('index.js'), false);
  assert.equal(isSensitiveFileName('tokenValidator.js'), false);
  assert.equal(isSensitiveFileName('README.md'), false);
});

test('collectSourceFiles excludes sensitive file names', async () => {
  await withTempDir('agentdocmap-secret-', async (target) => {
    await writeFiles(target, {
      'src/normal.js': 'export const a = 1;',
      'src/.env.local': 'API_KEY=secret',
      'src/config.local.js': 'module.exports = {};',
      'src/secrets.js': 'export const key = "";',
      'server/id_rsa': 'private-key',
      'server/api.pem': 'certificate',
      '.npmrc': 'registry=...',
    });

    const files = await collectSourceFiles({ targetRoot: target, jsdocConfig: null });
    const paths = files.map((file) => file.relativePath);

    assert.equal(paths.includes('src/normal.js'), true);
    assert.equal(paths.includes('src/.env.local'), false);
    assert.equal(paths.includes('src/config.local.js'), false);
    assert.equal(paths.includes('src/secrets.js'), false, 'literal secret-named files are excluded');
    assert.equal(paths.includes('server/id_rsa'), false);
    assert.equal(paths.includes('server/api.pem'), false);
    assert.equal(paths.includes('.npmrc'), false);
  });
});

test('collectSourceFiles skips sensitive directories', async () => {
  await withTempDir('agentdocmap-secret-', async (target) => {
    await writeFiles(target, {
      'src/normal.js': 'export const a = 1;',
      'secrets/nested.js': 'export const key = "";',
      '.env/production.js': 'export const prod = 1;',
    });

    const files = await collectSourceFiles({ targetRoot: target, jsdocConfig: null });
    const paths = files.map((file) => file.relativePath);

    assert.equal(paths.includes('src/normal.js'), true);
    assert.equal(paths.includes('secrets/nested.js'), false);
    assert.equal(paths.includes('.env/production.js'), false);
  });
});

test('redactScript masks common secret patterns', () => {
  assert.equal(redactScript('node server.js'), 'node server.js');
  assert.equal(redactScript('API_KEY=abc123 node deploy.js'), 'API_KEY=*** node deploy.js');
  assert.equal(redactScript('DEPLOY_TOKEN=xyz'), 'DEPLOY_TOKEN=***');
  assert.equal(redactScript('PASSWORD=super-secret'), 'PASSWORD=***');
  assert.equal(redactScript('curl -H "Authorization: Bearer super-secret-token"'), 'curl -H "Authorization: Bearer ***"');
  assert.equal(redactScript('curl --header Authorization: Basic ***REMOVED***'), 'curl --header Authorization: Basic ***');
  assert.equal(
    redactScript('npm config set //registry.npmjs.org/:_authToken=npm_xxxxxxxx'),
    'npm config set //registry.npmjs.org/:_authToken=***',
  );
  assert.equal(
    redactScript('git push https://user:password@github.com/org/repo.git'),
    'git push https://***:***@github.com/org/repo.git',
  );
});

test('redactScript avoids false positives for legitimate key names', () => {
  assert.equal(redactScript('TOKEN_EXPIRY_DAYS=30'), 'TOKEN_EXPIRY_DAYS=30');
  assert.equal(redactScript('AUTHORITY=http://example.com'), 'AUTHORITY=http://example.com');
  assert.equal(redactScript('AUTH0_CLIENT_ID=public'), 'AUTH0_CLIENT_ID=public');
  assert.equal(redactScript('PASS=through'), 'PASS=through');
  assert.equal(redactScript('SECRET_SANTA=group'), 'SECRET_SANTA=group');
});

test('redactScript masks quoted secret values while preserving quotes', () => {
  assert.equal(redactScript('API_KEY="secret"'), 'API_KEY="***"');
  assert.equal(redactScript("API_KEY='secret'"), "API_KEY='***'");
  assert.equal(redactScript('API_KEY=`secret`'), 'API_KEY=`***`');
  assert.equal(redactScript('PASSWORD="hunter2"'), 'PASSWORD="***"');
});

test('redactScript masks token-only URL credentials', () => {
  assert.equal(
    redactScript('git push https://token@github.com/org/repo.git'),
    'git push https://***@github.com/org/repo.git',
  );
});

test('buildAgentMap redacts package scripts before exposing them', () => {
  const map = buildAgentMap({
    projectName: 'SecretProject',
    targetRoot: '/tmp',
    generatedBy: 'AgentDocMap',
    sourceMetadata: 'none',
    generatedAtUtc: 'example',
    git: { commit: null, commitDate: null, branch: null, dirty: null },
    packageJson: {
      name: 'secret-project',
      scripts: {
        start: 'node server.js',
        'deploy:prod': 'API_KEY=abc123 DEPLOY_TOKEN=xyz node deploy.js',
        auth: 'curl -H "Authorization: Bearer super-secret-token" https://api.example.com',
        'auth:basic': 'curl --header Authorization: Basic ***REMOVED***',
        registry: 'npm config set //registry.npmjs.org/:_authToken=npm_xxxxxxxx',
        'git:push': 'git push https://user:password@github.com/org/repo.git',
      },
    },
    sourceAnalysis: { files: [] },
    doclets: [],
  });

  const scripts = map.project.packageScripts;
  assert.equal(scripts.start, 'node server.js');
  assert.equal(scripts['deploy:prod'].includes('abc123'), false);
  assert.equal(scripts['deploy:prod'].includes('API_KEY=***'), true);
  assert.equal(scripts['deploy:prod'].includes('DEPLOY_TOKEN=***'), true);
  assert.equal(scripts.auth.includes('super-secret-token'), false);
  assert.equal(scripts.auth.includes('Authorization: Bearer ***'), true);
  assert.equal(scripts['auth:basic'].includes('***REMOVED***'), false);
  assert.equal(scripts['auth:basic'].includes('Authorization: Basic ***'), true);
  assert.equal(scripts.registry.includes('npm_xxxxxxxx'), false);
  assert.equal(scripts.registry.includes('//registry.npmjs.org/:_authToken=***'), true);
  assert.equal(scripts['git:push'].includes('user:password@github.com'), false);
  assert.equal(scripts['git:push'].includes('https://***:***@github.com'), true);
});

test('writeAgentDocs writes redacted scripts to ENTRYPOINTS.md and agent-map.json', async () => {
  await withTempDir('agentdocmap-secret-', async (outDir) => {
    const map = buildAgentMap({
      projectName: 'SecretProject',
      targetRoot: path.join(os.tmpdir(), 'agentdocmap-target'),
      generatedBy: 'AgentDocMap',
      sourceMetadata: 'none',
      generatedAtUtc: 'example',
      git: { commit: null, commitDate: null, branch: null, dirty: null },
      packageJson: {
        name: 'secret-project',
        scripts: {
          'deploy:prod': 'API_KEY=abc123 DEPLOY_TOKEN=xyz node deploy.js',
        },
      },
      sourceAnalysis: { files: [] },
      doclets: [],
    });

    await writeAgentDocs({
      outDir,
      clean: true,
      targetRoot: path.join(os.tmpdir(), 'agentdocmap-target'),
      map,
    });

    const entrypoints = await fs.readFile(path.join(outDir, 'ENTRYPOINTS.md'), 'utf8');
    assert.equal(entrypoints.includes('abc123'), false);
    assert.equal(entrypoints.includes('API_KEY=***'), true);
    assert.equal(entrypoints.includes('DEPLOY_TOKEN=***'), true);

    const agentMap = JSON.parse(await fs.readFile(path.join(outDir, 'agent-map.json'), 'utf8'));
    assert.equal(agentMap.project.packageScripts['deploy:prod'].includes('abc123'), false);
  });
});
