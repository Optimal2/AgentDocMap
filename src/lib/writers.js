import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isRuntimeEntrypointPath } from './projectSignals.js';

const DEFAULT_MODULE_NAME = 'root';
const MAX_IMPORTANT_FILES_DISPLAY = 12;
const MAX_IMPORT_HUBS_DISPLAY = 20;
const MAX_REPORT_ITEMS = 15;
const MAX_IMPORTS_DISPLAY = 12;
const MAX_SYMBOLS_PER_FILE_DISPLAY = 12;
const ALLOWED_OUTPUT_DIRECTORY_NAMES = new Set(['docs-agent']);
const ALLOWED_OUTPUT_DIRECTORY_SUFFIX = '-agent-docs';
const TEMP_OUTPUT_DIRECTORY_PREFIX = 'agentdocmap-';
const TABLE_CELL_ESCAPE_PATTERN = /\r\n|\r|\n|[&<>"'\\|`[\]()]/g;
const SENSITIVE_OUTPUT_PATHS = new Set([
  path.parse(process.cwd()).root,
  process.cwd(),
  process.env.HOME,
  process.env.USERPROFILE,
].filter(Boolean).map((item) => path.resolve(item).toLowerCase()));

function safeFileName(value) {
  return String(value ?? DEFAULT_MODULE_NAME).replace(/[^a-z0-9._-]+/gi, '_');
}

export async function writeAgentDocs({ outDir, map, clean }) {
  if (clean) {
    assertSafeCleanOutputDirectory(outDir);
    await fs.rm(outDir, { recursive: true, force: true });
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.join(outDir, 'chunks'), { recursive: true });

  const outputs = new Map([
    ['AGENT_CONTEXT.md', renderAgentContext(map)],
    ['BUDGET.md', ''],
    ['CROSS_CUTTING.md', renderCrossCutting(map)],
    ['DEPENDENCIES.md', renderDependencies(map)],
    ['ENTRYPOINTS.md', renderEntrypoints(map)],
    ['FILE_MAP.md', renderFileMap(map)],
    ['SYMBOL_INDEX.md', renderSymbolIndex(map)],
    ['MODULES.md', renderModules(map)],
    ['REPORT.md', renderReport(map)],
    ['agent-map.json', toJsonString(map)],
    ['symbol-index.json', toJsonString(map.symbols)],
  ]);

  for (const module of map.modules) {
    outputs.set(path.join('chunks', `${safeFileName(module.name)}.md`), renderModuleChunk(map, module));
  }

  outputs.set('BUDGET.md', renderBudget(map, summarizeOutputBudget(outputs)));

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
    `Source commit: ${formatSourceCommit(map.generated)}`,
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
    '5. Open `CROSS_CUTTING.md` for hooks, contexts, workers, and risky source patterns.',
    '6. Open `DEPENDENCIES.md` when external package behavior matters.',
    '7. Open `BUDGET.md` when you need output size and token estimates.',
    '8. Use `SYMBOL_INDEX.md` for JSDoc-backed APIs.',
    '9. Use `agent-map.json` for tool-driven navigation.',
    '',
    '## Stats',
    '',
    `- Source files: ${map.stats.fileCount}`,
    `- Source lines: ${map.stats.sourceLineCount}`,
    `- JSDoc symbols: ${map.stats.docletCount}`,
    `- Files with JSDoc: ${map.stats.documentedFileCount}`,
    `- Low-confidence summaries: ${map.stats.lowConfidenceSummaryCount}`,
    `- Parse errors: ${map.stats.parseErrorCount}`,
    '',
    '## High-Signal Files',
    '',
    ...map.importantFiles.slice(0, MAX_IMPORTANT_FILES_DISPLAY).map((file) => `- \`${file.path}\` - ${file.summary}`),
    '',
  ];

  if (map.recommendations.length > 0) {
    lines.push('## Agent Notes', '');
    lines.push(...map.recommendations.map((item) => `- ${item}`), '');
  }

  return finishMarkdown(lines);
}

function renderCrossCutting(map) {
  const lines = [
    '# Cross-Cutting Index',
    '',
    'This index groups files by source-derived roles and risky source patterns. Treat it as a navigation aid, then inspect the source before editing.',
    '',
    '## File Roles',
    '',
  ];

  if (!map.crossCutting.roles || map.crossCutting.roles.length === 0) {
    lines.push('No cross-cutting file roles were detected.', '');
  } else {
    for (const role of map.crossCutting.roles) {
      lines.push(`### ${formatRoleName(role.role)}`, '');
      for (const file of role.files.slice(0, MAX_REPORT_ITEMS)) {
        lines.push(`- \`${file.path}\` (${file.lines ?? 'unknown'} lines) - ${file.summary}`);
      }
      lines.push('');
    }
  }

  lines.push('## Risky Source Patterns', '');
  if (!map.crossCutting.riskPatterns || map.crossCutting.riskPatterns.length === 0) {
    lines.push('No risky source patterns were detected by the built-in rules.');
  } else {
    for (const pattern of map.crossCutting.riskPatterns) {
      lines.push(`### ${pattern.key}`, '');
      lines.push(`${pattern.description}.`, '');
      for (const file of pattern.files.slice(0, MAX_REPORT_ITEMS)) {
        lines.push(`- \`${file.path}\` lines ${file.lines.join(', ')} - ${file.summary}`);
      }
      lines.push('');
    }
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

  for (const [name, version] of Object.entries(runtimeDeps).sort(([nameA], [nameB]) => nameA.localeCompare(nameB))) {
    const usage = usageByName.get(name);
    lines.push(`| \`${name}\` | \`${version}\` | ${usage?.importCount || 0} | ${formatUsageFiles(usage)} |`);
  }

  lines.push('', '## Development Dependencies', '');
  lines.push('| Package | Version | Observed source imports |');
  lines.push('| --- | --- | ---: |');
  for (const [name, version] of Object.entries(devDeps).sort(([nameA], [nameB]) => nameA.localeCompare(nameB))) {
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
    '| File | Lines | In | JSDoc | Confidence | Summary |',
    '| --- | ---: | ---: | ---: | --- | --- |',
  ];

  for (const file of map.files) {
    lines.push(`| \`${file.path}\` | ${file.lines ?? ''} | ${file.incomingLocalImports} | ${file.doclets.length} | ${file.summaryConfidence || ''} | ${escapeMarkdownTableCell(file.summary)} |`);
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
  const entrypointFiles = map.files.filter((file) => isRuntimeEntrypointPath(file.path));
  const importHubs = [...map.files]
    .sort((fileA, fileB) => fileB.incomingLocalImports - fileA.incomingLocalImports || fileA.path.localeCompare(fileB.path))
    .slice(0, MAX_IMPORT_HUBS_DISPLAY);

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
    lines.push(`| \`${symbol.longname || symbol.name}\` | ${symbol.kind || ''} | \`${symbol.file}${symbol.line ? `:${symbol.line}` : ''}\` | ${escapeMarkdownTableCell(symbol.description || '')} |`);
  }

  return finishMarkdown(lines);
}

function renderModules(map) {
  const lines = ['# Modules', ''];

  for (const module of map.modules) {
    lines.push(`## ${module.name}`, '');
    lines.push(`File count: ${module.fileCount}. Line count: ${module.lineCount}. JSDoc symbol count: ${module.docletCount}.`, '');
    for (const file of module.importantFiles) {
      lines.push(`- \`${file.path}\` - ${file.summary}`);
    }
    lines.push('');
  }

  return finishMarkdown(lines);
}

function renderReport(map) {
  const undocumented = map.files.filter((file) => file.doclets.length === 0);
  const lowConfidence = map.files.filter((file) => file.summaryConfidence === 'low');
  const largest = [...map.files].sort((fileA, fileB) => (fileB.lines || 0) - (fileA.lines || 0)).slice(0, MAX_REPORT_ITEMS);
  const importHubs = [...map.files].sort((fileA, fileB) => fileB.incomingLocalImports - fileA.incomingLocalImports).slice(0, MAX_REPORT_ITEMS);

  const lines = [
    '# AgentDocMap Report',
    '',
    '## Coverage',
    '',
    `- Files: ${map.stats.fileCount}`,
    `- Source lines: ${map.stats.sourceLineCount}`,
    `- JSDoc symbols: ${map.stats.docletCount}`,
    `- Files without JSDoc doclets: ${undocumented.length}`,
    `- Low-confidence summaries: ${lowConfidence.length}`,
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

  if (lowConfidence.length > 0) {
    lines.push('- Low-confidence summaries are generated from source shape rather than primary JSDoc.');
    lines.push('');
    lines.push('Low-confidence summaries:');
    lines.push(...lowConfidence.slice(0, MAX_REPORT_ITEMS).map((file) => `- \`${file.path}\`: ${file.summary}`));
    lines.push('');
  }

  if (map.stats.parseErrorCount > 0) {
    lines.push('- Improve parser plugin coverage for files listed in FILE_MAP.md.');
  }

  lines.push('- Compare this report after each generator change to confirm signal quality improved.');
  return finishMarkdown(lines);
}

function renderBudget(map, outputBudget) {
  const lines = [
    '# Output Budget',
    '',
    'Token counts are rough estimates using one token per four characters. Use this file to spot output growth before giving the packet to an AI agent.',
    '',
    '## Source Estimate',
    '',
    `- Source files: ${map.stats.fileCount}`,
    `- Source lines: ${map.stats.sourceLineCount}`,
    `- Estimated source-map tokens: ${map.stats.estimatedSourceTokens}`,
    '',
    '## Generated Output Estimate',
    '',
    `- Output files measured: ${outputBudget.fileCount} (excluding this budget file)`,
    `- Output lines: ${outputBudget.lineCount}`,
    `- Output characters: ${outputBudget.characterCount}`,
    `- Estimated output tokens: ${outputBudget.estimatedTokenCount}`,
    '',
    '## Largest Output Files',
    '',
    '| File | Lines | Characters | Estimated tokens |',
    '| --- | ---: | ---: | ---: |',
  ];

  for (const file of outputBudget.files.slice(0, MAX_REPORT_ITEMS)) {
    lines.push(`| \`${file.path}\` | ${file.lineCount} | ${file.characterCount} | ${file.estimatedTokenCount} |`);
  }

  return finishMarkdown(lines);
}

function renderModuleChunk(map, module) {
  const files = map.files.filter((file) => file.moduleKey === module.name);

  const lines = [
    `# ${map.project.name} / ${module.name}`,
    '',
    `File count: ${module.fileCount}. Line count: ${module.lineCount}. JSDoc symbol count: ${module.docletCount}.`,
    '',
  ];

  for (const file of files) {
    lines.push(`## ${file.path}`, '');
    lines.push(file.summary, '');
    if (file.exports.length > 0) {
      lines.push(`Exports: ${file.exports.map((item) => item.name).filter((name) => name != null).join(', ')}`, '');
    }
    if (file.localImports.length > 0) {
      const imports = file.localImports.map((item) => item.resolved || item.source).filter(Boolean);
      lines.push(`Local imports: ${imports.slice(0, MAX_IMPORTS_DISPLAY).join(', ')}`, '');
    }
    if (file.doclets.length > 0) {
      lines.push('Symbols:', '');
      for (const doclet of file.doclets.slice(0, MAX_SYMBOLS_PER_FILE_DISPLAY)) {
        lines.push(`- \`${doclet.longname || doclet.name}\` (${doclet.kind || 'symbol'}) - ${doclet.description || 'No description.'}`);
      }
      lines.push('');
    }
  }

  return finishMarkdown(lines);
}

/**
 * Escapes a value for safe display inside a Markdown table cell.
 *
 * Strategy:
 * - HTML-encode characters with special meaning in HTML (`&`, `<`, `>`, `"`, `'`).
 * - Backslash-escape Markdown syntax characters used by tables/inline formatting
 *   (`\\`, `|`, `` ` ``, `[`, `]`, `(`, `)`).
 * - Normalize line breaks to spaces so a cell stays on one table row.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeMarkdownTableCell(value) {
  const replacements = {
    '\r\n': ' ',
    '\r': ' ',
    '\n': ' ',
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '\\': '\\\\',
    '|': '\\|',
    '`': '\\`',
    '[': '\\[',
    ']': '\\]',
    '(': '\\(',
    ')': '\\)',
  };

  return String(value ?? '').replace(TABLE_CELL_ESCAPE_PATTERN, (match) => replacements[match]);
}

function assertSafeCleanOutputDirectory(outDir) {
  const resolved = path.resolve(outDir);
  const normalized = resolved.toLowerCase();
  const directoryName = path.basename(resolved);
  const tempRoot = path.resolve(os.tmpdir()).toLowerCase();
  const isAllowedNamedOutput = ALLOWED_OUTPUT_DIRECTORY_NAMES.has(directoryName)
    || (directoryName.endsWith(ALLOWED_OUTPUT_DIRECTORY_SUFFIX) && /^[a-z0-9._-]+$/i.test(directoryName));
  const isAllowedTemporaryOutput = directoryName.startsWith(TEMP_OUTPUT_DIRECTORY_PREFIX)
    && path.dirname(resolved).toLowerCase() === tempRoot;

  if (SENSITIVE_OUTPUT_PATHS.has(normalized) || (!isAllowedNamedOutput && !isAllowedTemporaryOutput)) {
    throw new Error(`Refusing to clean unsafe AgentDocMap output directory: ${resolved}`);
  }
}

function summarizeOutputBudget(outputs) {
  const files = [...outputs.entries()]
    .filter(([relativePath]) => relativePath !== 'BUDGET.md')
    .map(([relativePath, content]) => {
      const text = String(content ?? '');
      return {
        path: relativePath.split(path.sep).join('/'),
        lineCount: countLines(text),
        characterCount: text.length,
        estimatedTokenCount: estimateTokenCount(text),
      };
    })
    .sort((fileA, fileB) => fileB.estimatedTokenCount - fileA.estimatedTokenCount || fileA.path.localeCompare(fileB.path));

  return {
    fileCount: files.length,
    lineCount: files.reduce((sum, file) => sum + file.lineCount, 0),
    characterCount: files.reduce((sum, file) => sum + file.characterCount, 0),
    estimatedTokenCount: files.reduce((sum, file) => sum + file.estimatedTokenCount, 0),
    files,
  };
}

function countLines(text) {
  if (text.length === 0) {
    return 0;
  }

  return text.split(/\r\n|\r|\n/).length;
}

function estimateTokenCount(text) {
  return Math.ceil(String(text || '').length / 4);
}

function formatRoleName(role) {
  const labels = {
    config: 'Config Files',
    context: 'React Contexts',
    hook: 'Hooks',
    test: 'Tests',
    worker: 'Workers',
  };

  return labels[role] || role;
}

function toJsonString(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function formatSourceCommit(generated) {
  if (generated.sourceMetadata === 'none') {
    return 'not embedded';
  }

  return `${generated.sourceCommit || 'unknown'}${generated.sourceDirty ? ' (dirty)' : ''}`;
}

function formatUsageFiles(usage) {
  if (!usage || usage.files.length === 0) {
    return '';
  }

  return usage.files.slice(0, 5).map((file) => `\`${file}\``).join('<br>');
}

function finishMarkdown(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === '') {
    end -= 1;
  }

  return `${lines.slice(0, end).join('\n')}\n`;
}
