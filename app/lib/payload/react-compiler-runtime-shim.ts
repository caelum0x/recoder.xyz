const MEMO_CACHE_SENTINEL = Symbol.for('react.memo_cache_sentinel');

// Payload's precompiled admin bundle imports the React 19 compiler runtime.
// On React 18 we only need a stable fallback that preserves semantics; the
// compiler cache becomes a no-op optimization instead of a hard crash.
export function c(size: number): unknown[] {
  return Array.from({ length: size }, () => MEMO_CACHE_SENTINEL);
}
