import fs from 'node:fs/promises';
import path from 'node:path';
import { hasOwn } from './fsUtils.js';
import { assertSafeCleanOutputDirectory } from './outputGuard.js';
import { isRuntimeEntrypointPath } from './projectSignals.js';

const DEFAULT_MODULE_NAME = 'root';
const MAX_IMPORTANT_FILES_DISPLAY = 12;
const MAX_IMPORT_HUBS_DISPLAY = 20;
const MAX_REPORT_ITEMS = 15;
const MAX_IMPORTS_DISPLAY = 12;
const MAX_SYMBOLS_PER_FILE_DISPLAY = 12;
const MAX_USAGE_FILES_DISPLAY = 5;
// Rendered in the Used In column when a declared package has no observed-import entry at all.
const NO_USAGE_DATA_MARKER = '—';
const TABLE_CELL_ESCAPE_PATTERN = /\r\n|\r|\n|[&<>"'\\|`[\]()]/g;
// No '&' in this class: escapeMarkdownInline no longer maps it, and a character the
// pattern matches without a matching replacement entry would be substituted with the
// string "undefined". The pattern and the replacement table have to agree.
const INLINE_ESCAPE_PATTERN = /[<>\\`*_{}[\]()#+\-=!|~]/g;
const HTML_ESCAPE_PATTERN = /[&<>"']/g;
const BACKTICK_RUN_PATTERN = /`+/g;

function safeFileName(value) {
  return String(value ?? DEFAULT_MODULE_NAME).replace(/[^a-z0-9._-]+/gi, '_');
}

export async function writeAgentDocs({ outDir, map, clean, targetRoot }) {
  if (clean) {
    assertSafeCleanOutputDirectory(outDir, targetRoot);
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
    `# ${escapeMarkdownInline(map.project.name)} Agent Context`,
    '',
    `Generated: ${escapeMarkdownInline(map.generated.atUtc)}`,
    `Source commit: ${escapeMarkdownInline(formatSourceCommit(map.generated))}`,
    '',
    '## Project',
    '',
    `- Package: ${escapeMarkdownInline(map.project.packageName || map.project.name)}`,
    `- Version: ${escapeMarkdownInline(map.project.packageVersion || 'unknown')}`,
    `- Description: ${escapeMarkdownInline(map.project.description || 'No package description.')}`,
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
    ...map.importantFiles
      .slice(0, MAX_IMPORTANT_FILES_DISPLAY)
      .map((file) => `- ${formatMarkdownCode(file.path)} - ${escapeMarkdownInline(file.summary)}`),
    '',
  ];

  if (map.recommendations.length > 0) {
    lines.push('## Agent Notes', '');
    lines.push(...map.recommendations.map((item) => `- ${escapeMarkdownInline(item)}`), '');
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
      lines.push(`### ${escapeMarkdownInline(formatRoleName(role.role))}`, '');
      for (const file of role.files.slice(0, MAX_REPORT_ITEMS)) {
        lines.push(`- ${formatMarkdownCode(file.path)} (${file.lines ?? 'unknown'} lines) - ${escapeMarkdownInline(file.summary)}`);
      }
      lines.push('');
    }
  }

  lines.push('## Risky Source Patterns', '');
  if (!map.crossCutting.riskPatterns || map.crossCutting.riskPatterns.length === 0) {
    lines.push('No risky source patterns were detected by the built-in rules.');
  } else {
    for (const pattern of map.crossCutting.riskPatterns) {
      lines.push(`### ${escapeMarkdownInline(pattern.key)}`, '');
      lines.push(`${escapeMarkdownInline(pattern.description)}.`, '');
      for (const file of pattern.files.slice(0, MAX_REPORT_ITEMS)) {
        // `lines` means two different things in this file: a line COUNT on ordinary file
        // entries (see the other three uses) and an array of line NUMBERS on risk-pattern
        // entries. Only the latter can be joined, and an entry that ever arrives with the
        // count shape would throw a TypeError here rather than degrade. Reported by GitHub
        // code quality.
        const matchedLines = Array.isArray(file.lines) ? file.lines.join(', ') : String(file.lines ?? 'unknown');
        lines.push(`- ${formatMarkdownCode(file.path)} lines ${matchedLines} - ${escapeMarkdownInline(file.summary)}`);
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
    'Import counts include static `import` declarations and constant-specifier dynamic `import()` calls;',
    `the Used In column lists at most ${MAX_USAGE_FILES_DISPLAY} files and states the file total whenever it cannot be read off the cell`,
    '(more files than listed, or an import count that differs from the file count);',
    `${NO_USAGE_DATA_MARKER} means no import of the package was observed at all.`,
    '',
    '## Runtime Dependencies',
    '',
    '| Package | Version | Imports | Used In |',
    '| --- | --- | ---: | --- |',
  ];

  for (const [name, version] of Object.entries(runtimeDeps).sort(([nameA], [nameB]) => nameA.localeCompare(nameB))) {
    const usage = usageByName.get(name);
    lines.push(`| ${formatMarkdownTableCode(name)} | ${formatMarkdownTableCode(version)} | ${formatImportCount(usage)} | ${formatUsageFiles(usage)} |`);
  }

  lines.push('', '## Development Dependencies', '');
  lines.push('| Package | Version | Observed source imports |');
  lines.push('| --- | --- | ---: |');
  for (const [name, version] of Object.entries(devDeps).sort(([nameA], [nameB]) => nameA.localeCompare(nameB))) {
    const usage = usageByName.get(name);
    lines.push(`| ${formatMarkdownTableCode(name)} | ${formatMarkdownTableCode(version)} | ${formatImportCount(usage)} |`);
  }

  // Package names are untrusted strings; hasOwn() keeps inherited Object.prototype members
  // (a package literally named `constructor`) from counting as declared.
  const undeclared = map.packageUsage.filter((item) => !hasOwn(runtimeDeps, item.packageName) && !hasOwn(devDeps, item.packageName));
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
    lines.push(`| ${formatMarkdownTableCode(file.path)} | ${file.lines ?? ''} | ${file.incomingLocalImports} | ${file.doclets.length} | ${escapeMarkdownTableCell(file.summaryConfidence || '')} | ${escapeMarkdownTableCell(file.summary)} |`);
  }

  lines.push('');
  lines.push('## Parse Errors', '');

  const parseErrors = map.files.filter((file) => file.parseError);
  if (parseErrors.length === 0) {
    lines.push('No parse errors.');
  } else {
    for (const file of parseErrors) {
      lines.push(`- ${formatMarkdownCode(file.path)}: ${escapeMarkdownInline(file.parseError)}`);
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
      lines.push(`- ${formatMarkdownCode(name)}: ${formatMarkdownCode(command)}`);
    }
    lines.push('');
  }

  lines.push('## Runtime Entrypoints', '');
  if (entrypointFiles.length === 0) {
    // Sibling sections (Package Scripts, Parse Errors) say so explicitly rather than
    // leaving a heading over a blank line, where a reader cannot tell "none found" from
    // "the generator failed here". Reported by GitHub code quality.
    lines.push('_None detected._');
  }
  for (const file of entrypointFiles) {
    lines.push(`- ${formatMarkdownCode(file.path)} - ${escapeMarkdownInline(file.summary)}`);
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
    lines.push(`| ${formatMarkdownTableCode(symbol.longname || symbol.name)} | ${escapeMarkdownTableCell(symbol.kind || '')} | ${formatMarkdownTableCode(`${symbol.file}${symbol.line ? `:${symbol.line}` : ''}`)} | ${escapeMarkdownTableCell(symbol.description || '')} |`);
  }

  return finishMarkdown(lines);
}

function renderModules(map) {
  const lines = ['# Modules', ''];

  for (const module of map.modules) {
    lines.push(`## ${escapeMarkdownInline(module.name)}`, '');
    lines.push(`File count: ${module.fileCount}. Line count: ${module.lineCount}. JSDoc symbol count: ${module.docletCount}.`, '');
    for (const file of module.importantFiles) {
      lines.push(`- ${formatMarkdownCode(file.path)} - ${escapeMarkdownInline(file.summary)}`);
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
    lines.push(
      ...lowConfidence
        .slice(0, MAX_REPORT_ITEMS)
        .map((file) => `- ${formatMarkdownCode(file.path)}: ${escapeMarkdownInline(file.summary)}`),
    );
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
    `# ${escapeMarkdownInline(map.project.name)} / ${escapeMarkdownInline(module.name)}`,
    '',
    `File count: ${module.fileCount}. Line count: ${module.lineCount}. JSDoc symbol count: ${module.docletCount}.`,
    '',
  ];

  for (const file of files) {
    lines.push(`## ${escapeMarkdownInline(file.path)}`, '');
    lines.push(escapeMarkdownInline(file.summary), '');
    if (file.exports.length > 0) {
      const exportsList = file.exports
        .map((item) => item.name)
        .filter((name) => name != null)
        .map((name) => formatMarkdownCode(name))
        .join(', ');
      lines.push(`Exports: ${exportsList}`, '');
    }
    if (file.localImports.length > 0) {
      const imports = file.localImports
        .map((item) => item.resolved || item.source)
        .filter(Boolean)
        .map((item) => formatMarkdownCode(item));
      lines.push(`Local imports: ${imports.slice(0, MAX_IMPORTS_DISPLAY).join(', ')}`, '');
    }
    if (file.doclets.length > 0) {
      lines.push('Symbols:', '');
      for (const doclet of file.doclets.slice(0, MAX_SYMBOLS_PER_FILE_DISPLAY)) {
        lines.push(
          `- ${formatMarkdownCode(doclet.longname || doclet.name)} (${escapeMarkdownInline(doclet.kind || 'symbol')}) - ${escapeMarkdownInline(doclet.description || 'No description.')}`,
        );
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

function normalizeMarkdownInlineValue(value) {
  return String(value ?? '').replace(/\r\n|\r|\n/g, ' ');
}

function escapeMarkdownInline(value) {
  const normalized = normalizeMarkdownInlineValue(value);
  const replacements = {
    // '&' is deliberately absent. Markdown does not require entity encoding for an
    // ampersand, and these files are read as raw text by agents rather than rendered to
    // HTML -- so escaping it produced a literal "&amp;" in the output where the source
    // said "&". Reported by GitHub code quality against OpenDocViewer's generated
    // AGENT_CONTEXT.md. '<' and '>' stay escaped: those do change how a Markdown reader
    // treats the text, because they can open raw HTML.
    '<': '&lt;',
    '>': '&gt;',
    '\\': '\\\\',
    '`': '\\`',
    '*': '\\*',
    '_': '\\_',
    '{': '\\{',
    '}': '\\}',
    '[': '\\[',
    ']': '\\]',
    '(': '\\(',
    ')': '\\)',
    '#': '\\#',
    '+': '\\+',
    '-': '\\-',
    '=': '\\=',
    '!': '\\!',
    '|': '\\|',
    '~': '\\~',
  };

  return normalized.replace(INLINE_ESCAPE_PATTERN, (match) => replacements[match]);
}

function escapeHtmlText(value) {
  const normalized = normalizeMarkdownInlineValue(value);
  const replacements = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return normalized.replace(HTML_ESCAPE_PATTERN, (match) => replacements[match]).replaceAll('|', '&#124;');
}

function formatMarkdownCode(value) {
  const normalized = normalizeMarkdownInlineValue(value);
  const backtickRuns = normalized.match(BACKTICK_RUN_PATTERN) || [];
  const fenceLength = Math.max(1, ...backtickRuns.map((run) => run.length + 1));
  const fence = '`'.repeat(fenceLength);
  const needsPadding = normalized.startsWith('`') || normalized.endsWith('`');

  return needsPadding ? `${fence} ${normalized} ${fence}` : `${fence}${normalized}${fence}`;
}

function formatMarkdownTableCode(value) {
  return `<code>${escapeHtmlText(value)}</code>`;
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

// buildAgentMap emits sourceMetadata/sourceCommit/sourceBranch/sourceDirty;
// test/writers.test.js: "AGENT_CONTEXT.md renders the source commit from the real
// generated shape" binds the fixture keys to the builder with deepEqual.
function formatSourceCommit(generated) {
  if (generated.sourceMetadata === 'none') {
    return 'not embedded';
  }

  return `${generated.sourceCommit || 'unknown'}${generated.sourceDirty ? ' (dirty)' : ''}`;
}

function formatUsageFiles(usage) {
  if (!usage) {
    // No usage entry at all (the package was never seen in an import): distinct
    // from an entry that exists but lists zero files, which renders as an empty cell.
    return NO_USAGE_DATA_MARKER;
  }

  if (usage.files.length === 0) {
    return '';
  }

  const total = usage.files.length;
  const shown = usage.files.slice(0, MAX_USAGE_FILES_DISPLAY).map((file) => formatMarkdownTableCode(file));
  const hidden = total - shown.length;
  if (hidden > 0) {
    // The cell is HTML (<code> entries joined by <br>), so the plain-text note is
    // HTML-escaped like the entries, but not wrapped in <code>.
    shown.push(escapeHtmlText(`... (+${hidden} more, ${total} files total)`));
  } else if ((usage.importCount || 0) !== total) {
    // Every file is listed, but the Imports column counts import declarations, not
    // files, so a package imported more than once per file (e.g. a main entry plus a
    // worker URL) would otherwise read as if files were missing from the list.
    shown.push(escapeHtmlText(`(${total} ${total === 1 ? 'file' : 'files'} total)`));
  }

  return shown.join('<br>');
}

function formatImportCount(usage) {
  const total = usage?.importCount || 0;
  const dynamic = usage?.dynamicImportCount || 0;
  if (dynamic === 0) {
    return String(total);
  }

  return dynamic === total ? `${total} (dynamic)` : `${total} (${dynamic} dynamic)`;
}

function finishMarkdown(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === '') {
    end -= 1;
  }

  return `${lines.slice(0, end).join('\n')}\n`;
}
