/**
 * VS Code selector utilities for production engine
 */

export function parseVSCodeSelector(selector: string): any {
  // Basic implementation for VS Code selectors
  return {
    selector,
    parsed: true
  };
}

export function isValidSelector(selector: string): boolean {
  return typeof selector === 'string' && selector.length > 0;
}