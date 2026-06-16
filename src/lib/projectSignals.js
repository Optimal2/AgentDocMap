export const ENTRYPOINT_FILE_NAMES = Object.freeze([
  'index.js',
  'index.jsx',
  'main.js',
  'main.jsx',
  'App.js',
  'App.jsx',
  'vite.config.js',
]);

export const ENTRYPOINT_NAMES = new Set(ENTRYPOINT_FILE_NAMES);

export function isRuntimeEntrypointPath(filePath) {
  const parts = String(filePath || '').split('/');
  const fileName = parts[parts.length - 1] || '';
  return ENTRYPOINT_NAMES.has(fileName) || String(filePath || '').startsWith('server/');
}
