/**
 * Safe JSON parsing utility
 * Handles JSON parsing with error handling and fallback values
 */

export function safeJsonParse<T = any>(
  text: string,
  fallback: T | null = null
): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(
  value: any,
  fallback: string = '{}'
): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}