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
    imports: [],
    exports: [],
    declarations: [],
    parseError: null,
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
