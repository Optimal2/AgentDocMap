import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeAgentDocs({ outDir, map, clean }) {
  if (clean) {
    await fs.rm(outDir, { recursive: true, force: true });
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.join(outDir, 'chunks'), { recursive: true });

  const outputs = new Map([
    ['AGENT_CONTEXT.md', renderAgentContext(map)],
    ['DEPENDENCIES.md', renderDependencies(map)],
    ['ENTRYPOINTS.md', renderEntrypoints(map)],
    ['FILE_MAP.md', renderFileMap(map)],
    ['SYMBOL_INDEX.md', renderSymbolIndex(map)],
    ['MODULES.md', renderModules(map)],
    ['REPORT.md', renderReport(map)],
    ['agent-map.json', `${JSON.stringify(map, null, 2)}\n`],
    ['symbol-index.json', `${JSON.stringify(map.symbols, null, 2)}\n`],
  ]);

  for (const module of map.modules) {
    outputs.set(path.join('chunks', `${safeFileName(module.name)}.md`), renderModuleChunk(map, module));
  }

  const written = [];
  for (const [relativePath, content] of outputs) {
    const filePath = path.join(outDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    written.push(filePath);
  }

  return written;
}

function renderAgentContext(map) {
  const lines = [
    `# ${map.project.name} Agent Context`,
    '',
    `Generated: ${map.generated.atUtc}`,
    `Source commit: ${map.generated.sourceCommit || 'unknown'}${map.generated.sourceDirty ? ' (dirty)' : ''}`,
    '',
    '## Project',
    '',
    `- Package: ${map.project.packageName || map.project.name}`,
    `- Version: ${map.project.packageVersion || 'unknown'}`,
    `- Description: ${map.project.description || 'No package description.'}`,
    '',
    '## Read Order',
    '',
    '1. Read this file.',
    '2. Open `MODULES.md` for top-level structure.',
    '3. Open `FILE_MAP.md` only for the area you need.',
    '4. Open `ENTRYPOINTS.md` when you need startup, package scripts, or import hubs.',
    '5. Open `DEPENDENCIES.md` when external package behavior matters.',
    '6. Use `SYMBOL_INDEX.md` for JSDoc-backed APIs.',
    '7. Use `agent-map.json` for tool-driven navigation.',
    '',
    '## Stats',
    '',
    `- Source files: ${map.stats.fileCount}`,
    `- JSDoc symbols: ${map.stats.docletCount}`,
    `- Files with JSDoc: ${map.stats.documentedFileCount}`,
    `- Parse errors: ${map.stats.parseErrorCount}`,
    '',
    '## High-Signal Files',
    '',
    ...map.importantFiles.slice(0, 12).map((file) => `- \`${file.path}\` - ${file.summary}`),
    '',
  ];

  if (map.recommendations.length > 0) {
    lines.push('## Agent Notes', '');
    lines.push(...map.recommendations.map((item) => `- ${item}`), '');
  }

  return finishMarkdown(lines);
}

function renderDependencies(map) {
  const runtimeDeps = map.project.dependencies || {};
  const devDeps = map.project.devDependencies || {};
  const usageByName = new Map(map.packageUsage.map((item) => [item.packageName, item]));
  const lines = [
    '# Dependencies',
    '',
    'This file combines package.json declarations with observed source imports.',
    '',
    '## Runtime Dependencies',
    '',
    '| Package | Version | Imports | Used In |',
    '| --- | --- | ---: | --- |',
  ];

  for (const [name, version] of Object.entries(runtimeDeps).sort(([left], [right]) => left.localeCompare(right))) {
    const usage = usageByName.get(name);
    lines.push(`| \`${name}\` | \`${version}\` | ${usage?.importCount || 0} | ${formatUsageFiles(usage)} |`);
  }

  lines.push('', '## Development Dependencies', '');
  lines.push('| Package | Version | Observed source imports |');
  lines.push('| --- | --- | ---: |');
  for (const [name, version] of Object.entries(devDeps).sort(([left], [right]) => left.localeCompare(right))) {
    const usage = usageByName.get(name);
    lines.push(`| \`${name}\` | \`${version}\` | ${usage?.importCount || 0} |`);
  }

  const undeclared = map.packageUsage.filter((item) => !runtimeDeps[item.packageName] && !devDeps[item.packageName]);
  lines.push('', '## Imported But Not Declared Directly', '');
  if (undeclared.length === 0) {
    lines.push('No undeclared package imports were detected.');
  } else {
    for (const item of undeclared) {
      lines.push(`- \`${item.packageName}\`: ${item.importCount} imports in ${item.files.length} files`);
    }
  }

  return finishMarkdown(lines);
}

function renderFileMap(map) {
  const lines = [
    '# File Map',
    '',
    'Files are sorted by path. Incoming imports and doclet counts are useful signals for where to start.',
    '',
    '| File | Lines | In | JSDoc | Summary |',
    '| --- | ---: | ---: | ---: | --- |',
  ];

  for (const file of map.files) {
    lines.push(`| \`${file.path}\` | ${file.lines ?? ''} | ${file.incomingLocalImports} | ${file.doclets.length} | ${escapeTable(file.summary)} |`);
  }

  lines.push('');
  lines.push('## Parse Errors', '');

  const parseErrors = map.files.filter((file) => file.parseError);
  if (parseErrors.length === 0) {
    lines.push('No parse errors.');
  } else {
    for (const file of parseErrors) {
      lines.push(`- \`${file.path}\`: ${file.parseError}`);
    }
  }

  return finishMarkdown(lines);
}

function renderEntrypoints(map) {
  const scripts = map.project.packageScripts || {};
  const entrypointFiles = map.files.filter((file) => {
    const name = path.posix.basename(file.path);
    return ['index.js', 'index.jsx', 'main.js', 'main.jsx', 'App.js', 'App.jsx', 'vite.config.js'].includes(name) ||
      file.path.startsWith('server/');
  });
  const importHubs = [...map.files]
    .sort((left, right) => right.incomingLocalImports - left.incomingLocalImports || left.path.localeCompare(right.path))
    .slice(0, 20);

  const lines = [
    '# Entrypoints And Hubs',
    '',
    '## Package Scripts',
    '',
  ];

  if (Object.keys(scripts).length === 0) {
    lines.push('No package scripts were found.', '');
  } else {
    for (const [name, command] of Object.entries(scripts)) {
      lines.push(`- \`${name}\`: \`${command}\``);
    }
    lines.push('');
  }

  lines.push('## Runtime Entrypoints', '');
  for (const file of entrypointFiles) {
    lines.push(`- \`${file.path}\` - ${file.summary}`);
  }

  lines.push('', '## Import Hubs', '');
  for (const file of importHubs) {
    lines.push(`- \`${file.path}\`: ${file.incomingLocalImports} incoming local imports`);
  }

  return finishMarkdown(lines);
}

function renderSymbolIndex(map) {
  const lines = [
    '# Symbol Index',
    '',
    '| Symbol | Kind | File | Summary |',
    '| --- | --- | --- | --- |',
  ];

  for (const symbol of map.symbols) {
    lines.push(`| \`${symbol.longname || symbol.name}\` | ${symbol.kind || ''} | \`${symbol.file}${symbol.line ? `:${symbol.line}` : ''}\` | ${escapeTable(symbol.description || '')} |`);
  }

  return finishMarkdown(lines);
}

function renderModules(map) {
  const lines = ['# Modules', ''];

  for (const module of map.modules) {
    lines.push(`## ${module.name}`, '');
    lines.push(`Files: ${module.files}. Lines: ${module.lines}. JSDoc symbols: ${module.doclets}.`, '');
    for (const file of module.importantFiles) {
      lines.push(`- \`${file.path}\` - ${file.summary}`);
    }
    lines.push('');
  }

  return finishMarkdown(lines);
}

function renderReport(map) {
  const undocumented = map.files.filter((file) => file.doclets.length === 0);
  const largest = [...map.files].sort((left, right) => (right.lines || 0) - (left.lines || 0)).slice(0, 15);
  const importHubs = [...map.files].sort((left, right) => right.incomingLocalImports - left.incomingLocalImports).slice(0, 15);

  const lines = [
    '# AgentDocMap Report',
    '',
    '## Coverage',
    '',
    `- Files: ${map.stats.fileCount}`,
    `- JSDoc symbols: ${map.stats.docletCount}`,
    `- Files without JSDoc doclets: ${undocumented.length}`,
    `- Parse errors: ${map.stats.parseErrorCount}`,
    '',
    '## Import Hubs',
    '',
    ...importHubs.map((file) => `- \`${file.path}\`: ${file.incomingLocalImports} incoming local imports`),
    '',
    '## Largest Files',
    '',
    ...largest.map((file) => `- \`${file.path}\`: ${file.lines || 0} lines`),
    '',
    '## Next Iteration Signals',
    '',
  ];

  if (undocumented.length > 0) {
    lines.push('- Files without JSDoc doclets are covered by source-derived summaries only.');
    lines.push('');
    lines.push('Files without JSDoc doclets:');
    lines.push(...undocumented.map((file) => `- \`${file.path}\``));
    lines.push('');
  }

  if (map.stats.parseErrorCount > 0) {
    lines.push('- Improve parser plugin coverage for files listed in FILE_MAP.md.');
  }

  lines.push('- Compare this report after each generator change to confirm signal quality improved.');
  return finishMarkdown(lines);
}

function renderModuleChunk(map, module) {
  const files = map.files.filter((file) => file.moduleKey === module.name);

  const lines = [
    `# ${map.project.name} / ${module.name}`,
    '',
    `Files: ${module.files}. Lines: ${module.lines}. JSDoc symbols: ${module.doclets}.`,
    '',
  ];

  for (const file of files) {
    lines.push(`## ${file.path}`, '');
    lines.push(file.summary, '');
    if (file.exports.length > 0) {
      lines.push(`Exports: ${file.exports.map((item) => item.name).filter(Boolean).join(', ')}`, '');
    }
    if (file.localImports.length > 0) {
      const imports = file.localImports.map((item) => item.resolved || item.source).filter(Boolean);
      lines.push(`Local imports: ${imports.slice(0, 12).join(', ')}`, '');
    }
    if (file.doclets.length > 0) {
      lines.push('Symbols:', '');
      for (const doclet of file.doclets.slice(0, 12)) {
        lines.push(`- \`${doclet.longname || doclet.name}\` (${doclet.kind || 'symbol'}) - ${doclet.description || 'No description.'}`);
      }
      lines.push('');
    }
  }

  return finishMarkdown(lines);
}

function escapeTable(value) {
  return String(value || '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

function formatUsageFiles(usage) {
  if (!usage || usage.files.length === 0) {
    return '';
  }

  return usage.files.slice(0, 5).map((file) => `\`${file}\``).join('<br>');
}

function safeFileName(value) {
  return String(value || 'root').replace(/[^a-z0-9._-]+/gi, '_');
}

function finishMarkdown(lines) {
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return `${lines.join('\n')}\n`;
}
