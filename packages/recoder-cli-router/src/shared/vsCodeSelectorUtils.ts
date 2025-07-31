/**
 * VS Code selector utilities (stub implementation for router)
 */

export const SELECTOR_SEPARATOR = '::';

export function stringifyVsCodeLmModelSelector(selector: any): string {
  // This is a stub implementation for the router
  // In a real implementation, this would stringify VS Code LM model selectors
  if (typeof selector === 'string') {
    return selector;
  }
  return JSON.stringify(selector);
}

export function parseVsCodeLmModelSelector(selectorString: string): any {
  // This is a stub implementation
  try {
    return JSON.parse(selectorString);
  } catch {
    return selectorString;
  }
}

export function validateVsCodeLmModelSelector(selector: any): boolean {
  // This is a stub implementation
  return true;
}