import { double } from './math.js';

/**
 * Loads the optional formatter package on demand and doubles the value first.
 * The package import is dynamic so the fixture exercises `import()` tracking.
 * @param {number} value Input value.
 * @returns {Promise<string>} Formatted text.
 */
export async function formatLazily(value) {
  const formatter = await import('lazy-formatter');
  const helpers = await import('./math.js');
  return formatter.format(helpers.double(double(value)));
}
