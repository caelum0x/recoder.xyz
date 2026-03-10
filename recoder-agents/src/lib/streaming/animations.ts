'use client';

/**
 * Smooth streaming animation hook.
 *
 * Smooth character-by-character reveal is currently disabled.
 * When disabled, text is returned as-is (no animation overhead).
 * To re-enable, implement the SmoothStreamStore class with
 * requestAnimationFrame-based character reveal.
 */
export function useSmoothStream(
  text: string,
  _enabled: boolean = true,
): string {
  return text;
}
