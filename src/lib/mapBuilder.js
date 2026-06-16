import path from 'node:path';
import { firstSentence, normalizeRelativePath, toPosixPath, truncateText } from './fsUtils.js';

const ENTRYPOINT_NAMES = new Set([
  'index.js',
  'index.jsx',
  'main.js',
  'main.jsx',
  'App.js',
  'App.jsx',
  'vite.config.js',
]);

export function buildAgentMap({
  projectName,
  targetRoot,
  generatedBy,
  generatedAtUtc,
  git,
  packageJson,
  sourceAnalysis,
  doclets,
}) {
  const fileMap = new Map(sourceAnalysis.files.map((file) => [file.path, { ...file, doclets: [] }]));
  const normalizedDoclets = normalizeDoclets({ targetRoot, doclets });

  for (const doclet of normalizedDoclets) {
    if (!doclet.file) {
      continue;
    }

    if (!fileMap.has(doclet.file)) {
      fileMap.set(doclet.file, createVirtualFile(doclet.file));
    }

    fileMap.get(doclet.file).doclets.push(doclet);
  }

  const files = [...fileMap.values()].map((file) => ({
    ...file,
    moduleKey: moduleKeyForPath(file.path),
    localImports: [],
    packageImports: [],
    incomingLocalImports: 0,
    importanceScore: 0,
    summary: summarizeFile(file),
  }));

  const filesByPath = new Map(files.map((file) => [file.path, file]));
  for (const file of files) {
    for (const importItem of file.imports || []) {
      if (isLocalImport(importItem.source)) {
        const resolved = resolveLocalImport(file.path, importItem.source, filesByPath);
        file.localImports.push({ ...importItem, resolved });
        if (resolved && filesByPath.has(resolved)) {
          filesByPath.get(resolved).incomingLocalImports += 1;
        }
      } else {
        file.packageImports.push(importItem);
      }
    }
  }

  for (const file of files) {
    file.importanceScore = scoreFile(file);
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  const importantFiles = [...files]
    .sort((left, right) => right.importanceScore - left.importanceScore || left.path.localeCompare(right.path))
    .slice(0, 20)
    .map(toFilePointer);

  const modules = buildModules(files);
  const symbols = normalizedDoclets
    .filter((doclet) => doclet.name && doclet.file)
    .sort((left, right) => left.file.localeCompare(right.file) || left.name.localeCompare(right.name));

  return {
    schemaVersion: 1,
    project: {
      name: projectName,
      packageName: packageJson?.name || null,
      packageVersion: packageJson?.version || null,
      description: packageJson?.description || null,
      packageScripts: packageJson?.scripts || {},
    },
    generated: {
      by: generatedBy,
      atUtc: generatedAtUtc,
      sourceCommit: git.commit,
      sourceBranch: git.branch,
      sourceDirty: git.dirty,
    },
    stats: {
      fileCount: files.length,
      docletCount: symbols.length,
      documentedFileCount: files.filter((file) => file.doclets.length > 0).length,
      parseErrorCount: files.filter((file) => file.parseError).length,
      packageDependencyCount: Object.keys(packageJson?.dependencies || {}).length,
      devDependencyCount: Object.keys(packageJson?.devDependencies || {}).length,
    },
    recommendations: buildRecommendations(files, symbols),
    importantFiles,
    modules,
    files,
    symbols,
  };
}

function createVirtualFile(filePath) {
  return {
    path: filePath,
    lines: null,
    extension: path.extname(filePath),
    jsdocBlockCount: 0,
    imports: [],
    exports: [],
    declarations: [],
    parseError: null,
    doclets: [],
  };
}

function normalizeDoclets({ targetRoot, doclets }) {
  return doclets
    .filter((doclet) => doclet.kind !== 'package')
    .filter(isAgentUsefulDoclet)
    .map((doclet) => {
      const file = normalizeDocletFile(targetRoot, doclet);
      const description = plainText(doclet.description || doclet.classdesc || doclet.summary || '');
      return {
        id: doclet.longname || doclet.name || null,
        name: doclet.name || doclet.longname || null,
        longname: doclet.longname || null,
        kind: doclet.kind || null,
        scope: doclet.scope || null,
        file,
        line: doclet.meta?.lineno || null,
        description: firstSentence(description),
        params: (doclet.params || []).map((param) => ({
          name: param.name,
          type: typeNames(param.type),
          optional: Boolean(param.optional),
          description: truncateText(plainText(param.description || ''), 140),
        })),
        returns: (doclet.returns || []).map((item) => ({
          type: typeNames(item.type),
          description: truncateText(plainText(item.description || ''), 140),
        })),
        examples: (doclet.examples || []).length,
      };
    });
}

function isAgentUsefulDoclet(doclet) {
  if (doclet.undocumented) {
    return false;
  }

  const hasText = Boolean(String(doclet.description || doclet.classdesc || doclet.summary || '').trim());
  const hasApiShape = (doclet.params || []).length > 0 || (doclet.returns || []).length > 0 || (doclet.examples || []).length > 0;
  const structuralKind = ['module', 'class', 'function', 'typedef', 'event', 'callback'].includes(doclet.kind);
  return hasText || hasApiShape || structuralKind;
}

function plainText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDocletFile(targetRoot, doclet) {
  const meta = doclet.meta;
  if (!meta?.filename) {
    return null;
  }

  const absolutePath = meta.path ? path.resolve(meta.path, meta.filename) : path.resolve(targetRoot, meta.filename);
  const relative = normalizeRelativePath(targetRoot, absolutePath);
  return relative.startsWith('..') ? toPosixPath(meta.filename) : relative;
}

function typeNames(type) {
  return (type?.names || []).join('|') || null;
}

function isLocalImport(value) {
  return typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'));
}

function resolveLocalImport(fromFile, source, filesByPath) {
  const fromDir = path.posix.dirname(fromFile);
  const base = path.posix.normalize(path.posix.join(fromDir, source));
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.posix.join(base, 'index.js'),
    path.posix.join(base, 'index.jsx'),
  ];

  return candidates.find((candidate) => filesByPath.has(candidate)) || null;
}

function summarizeFile(file) {
  const exportedNames = new Set((file.exports || []).map((item) => item.name).filter(Boolean));
  const primaryDoclet =
    file.doclets.find((doclet) => doclet.kind === 'module' && doclet.description) ||
    file.doclets.find((doclet) => exportedNames.has(doclet.name) && doclet.description) ||
    file.doclets.find((doclet) => ['class', 'function', 'typedef'].includes(doclet.kind) && doclet.description) ||
    file.doclets.find((doclet) => doclet.description) ||
    file.doclets[0];
  if (primaryDoclet?.description) {
    return primaryDoclet.description;
  }

  const exportedList = [...exportedNames];
  if (exportedList.length > 0) {
    if (exportedList.length === 1 && exportedList[0] === 'default') {
      const declarationNames = (file.declarations || []).map((item) => item.name).filter(Boolean);
      if (declarationNames.length > 0) {
        return `Default export for ${declarationNames[0]}.`;
      }

      const stem = path.posix.basename(file.path, path.posix.extname(file.path));
      return `Default export for ${stem}.`;
    }

    return `Exports ${exportedList.slice(0, 5).join(', ')}.`;
  }

  const declarations = (file.declarations || []).map((item) => item.name).filter(Boolean);
  if (declarations.length > 0) {
    return `Defines ${declarations.slice(0, 5).join(', ')}.`;
  }

  return 'No summary available from JSDoc or exports.';
}

function scoreFile(file) {
  let score = 0;
  const name = path.posix.basename(file.path);
  if (ENTRYPOINT_NAMES.has(name)) {
    score += 80;
  }

  if (file.path.startsWith('server/')) {
    score += 20;
  }

  score += Math.min(60, file.incomingLocalImports * 8);
  score += Math.min(30, (file.exports || []).length * 5);
  score += Math.min(24, file.doclets.length * 3);
  score += Math.min(20, Math.floor((file.lines || 0) / 120));
  return score;
}

function toFilePointer(file) {
  return {
    path: file.path,
    score: file.importanceScore,
    lines: file.lines,
    incomingLocalImports: file.incomingLocalImports,
    doclets: file.doclets.length,
    summary: file.summary,
  };
}

function buildModules(files) {
  const modules = new Map();
  for (const file of files) {
    const key = file.moduleKey;
    if (!modules.has(key)) {
      modules.set(key, {
        name: key,
        files: 0,
        lines: 0,
        doclets: 0,
        importantFiles: [],
      });
    }

    const module = modules.get(key);
    module.files += 1;
    module.lines += file.lines || 0;
    module.doclets += file.doclets.length;
    module.importantFiles.push(toFilePointer(file));
  }

  return [...modules.values()]
    .map((module) => ({
      ...module,
      importantFiles: module.importantFiles
        .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
        .slice(0, 8),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function moduleKeyForPath(filePath) {
  const parts = filePath.split('/');
  if (parts[0] === 'server') {
    return 'server';
  }

  if (parts[0] !== 'src') {
    return parts[0] || '.';
  }

  if (parts[1] === 'components') {
    const focusedComponentGroups = new Set(['DocumentLoader', 'DocumentToolbar', 'DocumentViewer', 'common']);
    if (focusedComponentGroups.has(parts[2])) {
      return `src/components/${parts[2]}`;
    }

    return 'src/components';
  }

  if (parts[1]) {
    return `src/${parts[1]}`;
  }

  return 'src/root';
}

function buildRecommendations(files, symbols) {
  const undocumentedFiles = files.filter((file) => file.doclets.length === 0).length;
  const parseErrors = files.filter((file) => file.parseError).length;
  const recommendations = [];

  if (undocumentedFiles > 0) {
    recommendations.push(`${undocumentedFiles} files have no JSDoc doclets; AgentDocMap uses source-derived summaries for them.`);
  }

  if (parseErrors > 0) {
    recommendations.push(`${parseErrors} files could not be parsed by the source analyzer; check REPORT.md for details.`);
  }

  if (symbols.length > 250) {
    recommendations.push('Use AGENT_CONTEXT.md first, then SYMBOL_INDEX.md by file path to avoid loading the whole symbol JSON.');
  }

  return recommendations;
}
