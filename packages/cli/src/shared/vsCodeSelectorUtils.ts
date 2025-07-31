/**
 * VS Code Language Model Selector Utilities
 */

export const SELECTOR_SEPARATOR = "::";

export function stringifyVsCodeLmModelSelector(family: string, id: string): string {
  return `${family}${SELECTOR_SEPARATOR}${id}`;
}

export function parseVsCodeLmModelSelector(selector: string): { family: string; id: string } {
  const [family, id] = selector.split(SELECTOR_SEPARATOR);
  return { family: family || "", id: id || "" };
}