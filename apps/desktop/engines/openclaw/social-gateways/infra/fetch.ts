// Owned by Recoder. The raw gateway imported `../infra/fetch.js` to resolve a
// usable `fetch` implementation (explicit override → global `fetch` → none).
// That infra sibling was not part of the extraction. The Discord adapter
// (`api.ts`, `probe.ts`, `pluralkit.ts`) calls `resolveFetch(fetcher?)` and
// treats `undefined` as "no HTTP available — skip the call". Reconstructed here
// as its real, dependency-free behavior.

/**
 * Resolve the `fetch` implementation to use for an outbound HTTP call.
 *
 * Resolution order:
 *   1. an explicitly supplied `fetcher` (tests / dependency injection),
 *   2. the runtime global `fetch` (Node 18+, Bun, browsers),
 *   3. `undefined` when no fetch is available, letting callers degrade
 *      gracefully instead of throwing.
 */
export function resolveFetch(fetcher?: typeof fetch): typeof fetch | undefined {
  if (fetcher) {
    return fetcher;
  }
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  return undefined;
}
