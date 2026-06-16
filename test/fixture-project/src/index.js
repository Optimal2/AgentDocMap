import { double } from './math.js';

/**
 * Formats a doubled number for display.
 * @param {number} value Input value.
 * @returns {string} Display text.
 */
export function formatDouble(value) {
  return `Value: ${double(value)}`;
}
