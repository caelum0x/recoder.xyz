/**
 * useDebounce — return a copy of `value` that only updates after it has stopped
 * changing for `delayMs`. Used by the board search so a keystroke does not fire a
 * `GET /workspaces?q=` per character; the query lands once the operator pauses.
 *
 * Preact-native (binds to `preact/hooks`, never React). Pass a PRIMITIVE value
 * (string / serialized key), not a freshly-allocated object each render — an
 * object whose identity changes every render would reset the timer forever and
 * never settle. Callers that need to debounce structured filters serialize them
 * to a stable string first.
 */
import { useEffect, useState } from 'preact/hooks';

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
