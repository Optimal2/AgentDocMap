import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';

const PARSER_PLUGINS = [
  'jsx',
  'importMeta',
  'dynamicImport',
  'classProperties',
  'objectRestSpread',
  'optionalChaining',
  'nullishCoalescingOperator',
  'topLevelAwait',
];

const RISK_PATTERNS = Object.freeze([
  {
    key: 'dangerouslySetInnerHTML',
    description: 'React raw HTML rendering',
    pattern: /dangerouslySetInnerHTML/g,
  },
  {
    key: 'eval',
    description: 'Dynamic code execution',
    pattern: /\beval\s*\(/g,
  },
  {
    key: 'innerHTML',
    description: 'Direct DOM HTML assignment or access',
    pattern: /\.innerHTML\b/g,
  },
]);

export async function analyzeSources({ targetRoot, sourceFiles }) {
  const files = [];

  for (const sourceFile of sourceFiles) {
    files.push(await analyzeFile({ targetRoot, sourceFile }));
  }

  return { files };
}

async function analyzeFile({ targetRoot, sourceFile }) {
  const text = await fs.readFile(sourceFile.absolutePath, 'utf8');
  const lineCount = text.split(/\r\n|\r|\n/).length;
  const jsdocBlockCount = (text.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
  const result = {
    path: sourceFile.relativePath,
    lines: lineCount,
    extension: path.extname(sourceFile.relativePath),
    jsdocBlockCount,
    sourceSummary: extractLeadingJsdocSummary(text),
    imports: [],
    exports: [],
    declarations: [],
    parseError: null,
    signals: {
      roles: [],
      riskPatterns: [],
    },
  };

  let ast;
  try {
    ast = parse(text, {
      sourceType: 'module',
      sourceFilename: path.relative(targetRoot, sourceFile.absolutePath),
      plugins: PARSER_PLUGINS,
      errorRecovery: true,
    });
  } catch (error) {
    result.parseError = error instanceof Error ? error.message : String(error);
    return result;
  }

  walkAst(ast.program, (node) => {
    if (node.type === 'ImportDeclaration') {
      result.imports.push({
        source: node.source.value,
        specifiers: node.specifiers.map((specifier) => specifier.local?.name).filter(Boolean),
        line: node.loc?.start?.line || null,
      });
      return;
    }

    if (node.type === 'ExportNamedDeclaration') {
      collectNamedExport(result, node);
      return;
    }

    if (node.type === 'ExportDefaultDeclaration') {
      result.exports.push({
        name: getDeclarationName(node.declaration) || 'default',
        kind: 'default',
        line: node.loc?.start?.line || null,
      });
      return;
    }

    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      const name = node.id?.name;
      if (name) {
        result.declarations.push({
          name,
          kind: node.type === 'ClassDeclaration' ? 'class' : inferFunctionKind(name, node),
          line: node.loc?.start?.line || null,
        });
      }
      return;
    }

    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      const kind = inferVariableKind(node.id.name, node.init);
      if (kind) {
        result.declarations.push({
          name: node.id.name,
          kind,
          line: node.loc?.start?.line || null,
        });
      }
    }
  });

  result.signals = collectFileSignals(text, result);
  return result;
}

function collectNamedExport(result, node) {
  if (node.declaration) {
    const name = getDeclarationName(node.declaration);
    if (name) {
      result.exports.push({
        name,
        kind: node.declaration.type.replace('Declaration', '').toLowerCase(),
        line: node.loc?.start?.line || null,
      });
    }
    return;
  }

  for (const specifier of node.specifiers || []) {
    result.exports.push({
      name: specifier.exported?.name || specifier.local?.name,
      kind: 'named',
      source: node.source?.value || null,
      line: node.loc?.start?.line || null,
    });
  }
}

function getDeclarationName(declaration) {
  if (!declaration) {
    return null;
  }

  if (declaration.type === 'Identifier') {
    return declaration.name;
  }

  if (declaration.type === 'CallExpression' && isReactWrapper(declaration.callee)) {
    return declaration.arguments?.[0]?.name || null;
  }

  if (declaration.id?.name) {
    return declaration.id.name;
  }

  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations?.[0]?.id?.name || null;
  }

  return null;
}

function inferVariableKind(name, init) {
  if (!init) {
    return null;
  }

  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    return inferFunctionKind(name, init);
  }

  if (init.type === 'CallExpression' && isReactWrapper(init.callee)) {
    return startsWithUppercase(name) ? 'component' : 'function';
  }

  if (init.type === 'ObjectExpression') {
    return 'object';
  }

  return null;
}

function inferFunctionKind(name, node) {
  if (startsWithUppercase(name) || returnsJsx(node.body)) {
    return 'component';
  }

  return 'function';
}

function startsWithUppercase(value) {
  return /^[A-Z]/.test(value || '');
}

function isReactWrapper(callee) {
  if (callee?.type === 'MemberExpression') {
    const objectName = callee.object?.name;
    const propertyName = callee.property?.name;
    return objectName === 'React' && ['memo', 'forwardRef'].includes(propertyName);
  }

  return false;
}

function returnsJsx(node) {
  let found = false;
  walkAst(node, (child) => {
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
      found = true;
    }
  });
  return found;
}

function collectFileSignals(text, file) {
  return {
    roles: detectRoles(file),
    riskPatterns: detectRiskPatterns(text),
  };
}

function extractLeadingJsdocSummary(text) {
  const match = String(text || '').match(/^\s*(?:(?:\/\/[^\n]*\n)+)?\s*\/\*\*([\s\S]*?)\*\//);
  if (!match) {
    return null;
  }

  const cleaned = match[1]
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line && !line.startsWith('@') && !line.startsWith('File:') && !isSectionHeading(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return null;
  }

  const sentence = cleaned.match(/^(.+?[.!?])\s/)?.[1] || cleaned;
  return sentence.slice(0, 220).trim();
}

function isSectionHeading(value) {
  return /^[A-Z][A-Z0-9 _/-]{2,}:?$/.test(value);
}

function detectRoles(file) {
  const roles = new Set();
  const fileName = path.basename(file.path);
  const normalizedPath = file.path.toLowerCase();
  const declarationNames = (file.declarations || []).map((item) => item.name).filter(Boolean);

  if (/^use[A-Z]/.test(fileName) || declarationNames.some((name) => /^use[A-Z]/.test(name))) {
    roles.add('hook');
  }

  if (normalizedPath.includes('/contexts/') || importsCreateContext(file)) {
    roles.add('context');
  }

  if (normalizedPath.includes('worker')) {
    roles.add('worker');
  }

  if (/\.(test|spec)\.[cm]?[jt]sx?$/i.test(file.path)) {
    roles.add('test');
  }

  if (/(^|\/)(vite|webpack|rollup|eslint|prettier|jsdoc)\.config\./i.test(file.path) || fileName === 'package.json') {
    roles.add('config');
  }

  return [...roles].sort();
}

function importsCreateContext(file) {
  return (file.imports || []).some((item) => item.source === 'react' && (item.specifiers || []).includes('createContext'));
}

function detectRiskPatterns(text) {
  const results = [];
  for (const pattern of RISK_PATTERNS) {
    const lines = findMatchingLines(text, pattern.pattern);
    if (lines.length > 0) {
      results.push({
        key: pattern.key,
        description: pattern.description,
        lines,
      });
    }
  }

  return results;
}

function findMatchingLines(text, pattern) {
  const lines = [];
  const sourceLines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < sourceLines.length; index += 1) {
    pattern.lastIndex = 0;
    if (pattern.test(sourceLines[index])) {
      lines.push(index + 1);
    }
  }

  return lines.slice(0, 12);
}

function walkAst(node, visitor) {
  if (!node || typeof node !== 'object') {
    return;
  }

  visitor(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'comments') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walkAst(item, visitor);
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walkAst(value, visitor);
    }
  }
}
