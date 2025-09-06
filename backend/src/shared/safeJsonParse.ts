/**
 * Re-export shared safeJsonParse utility for backend compatibility
 */

// // Export local JSON parsing utilities
// TODO: Replace with actual local exports when available
// export * from 'recoder-shared';
// TODO: Replace with actual shared JSON parsing utilities when available

export function safeJsonParse(json: string, fallback: any = null) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
