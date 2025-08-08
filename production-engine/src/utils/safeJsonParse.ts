/**
 * Safe JSON parsing utility
 */

export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

export default safeJsonParse;