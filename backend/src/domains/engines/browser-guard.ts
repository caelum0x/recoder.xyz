/**
 * browser-guard — the browser egress trust boundary (W8-D2 SSRF defense).
 *
 * Agents drive `browser.navigate` / `browser.extract` / `browser.screenshot`
 * with task-supplied URLs; without a guard a hostile task can point the browser
 * at 169.254.169.254 (cloud metadata), loopback, or RFC-1918 space. This module
 * is a pure {@link BrowserDriver} DECORATOR that vets every URL BEFORE the inner
 * driver sees it:
 *
 *  1. Egress guard (ALWAYS on): the shared `egress-guard` chokepoint refuses
 *     non-http(s) schemes and non-public targets. With an injected resolver it
 *     also DNS-resolves hostnames and blocks public-looking names that map into
 *     private/metadata space (the DNS-rebind pivot).
 *  2. Domain allowlist (operator-configured, `BROWSER_ALLOWED_DOMAINS`): when
 *     non-empty, the URL host must equal — or be a '.'-boundary subdomain of —
 *     an allowlisted entry ('evil-recoder.xyz' does NOT match 'recoder.xyz').
 *
 * On violation the decorator THROWS with the truthful reason; the wrapping
 * engine's degrade contract maps any non-BrowserNotConfiguredError throw to
 * `status: 'error'`, so tool callers get a truthful error result, never a
 * fabricated page. URL-less calls ("the current page") pass through untouched —
 * that page was already vetted at navigate time. The resolver is INJECTED
 * (exactly like egress-guard.ts) so unit tests stay network-free; the
 * composition root wires the real DNS lookup.
 */
import type { BrowserDriver, BrowserEnv } from '@recoder/agent-browser';
import {
  assertEgressAllowed,
  assertEgressAllowedResolved,
  type HostResolver,
} from '../../shared/egress-guard.js';

export type BrowserGuardOptions = {
  /** Operator allowlist; absent/empty ⇒ no domain restriction (egress guard stays on). */
  allowedDomains?: readonly string[];
  /** Injected DNS resolver enabling the rebind check. Absent ⇒ sync guard only. */
  resolve?: HostResolver;
};

/**
 * Wrap a driver so every URL-bearing call is vetted (egress + allowlist) before
 * the inner driver runs. Preserves `inner.kind` — health stays truthful.
 */
export function guardBrowserDriver(
  inner: BrowserDriver,
  opts: BrowserGuardOptions = {},
): BrowserDriver {
  const { allowedDomains, resolve } = opts;

  async function vet(url: string): Promise<void> {
    const parsed = resolve
      ? await assertEgressAllowedResolved(url, resolve)
      : assertEgressAllowed(url);
    if (allowedDomains !== undefined && allowedDomains.length > 0) {
      const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
      const allowed = allowedDomains.some((d) => host === d || host.endsWith(`.${d}`));
      if (!allowed) {
        throw new Error(
          `domain_blocked: host '${host}' not in BROWSER_ALLOWED_DOMAINS (${url})`,
        );
      }
    }
  }

  return {
    kind: inner.kind,
    async navigate(url) {
      await vet(url);
      return inner.navigate(url);
    },
    async extractText(url) {
      if (url !== undefined) await vet(url);
      return inner.extractText(url);
    },
    async screenshot(url) {
      if (url !== undefined) await vet(url);
      return inner.screenshot(url);
    },
  };
}

/**
 * Parse `BROWSER_ALLOWED_DOMAINS` (comma-separated, trimmed, lowercased) from the
 * env subset. `BrowserEnv` is a closed type without the key, so the widened read
 * is confined to this helper. Absent/blank ⇒ undefined (no allowlist restriction).
 */
export function parseAllowedDomains(
  env: BrowserEnv | undefined,
): readonly string[] | undefined {
  const raw = (env as { BROWSER_ALLOWED_DOMAINS?: unknown } | undefined)
    ?.BROWSER_ALLOWED_DOMAINS;
  if (typeof raw !== 'string') return undefined;
  const domains = raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
  return domains.length > 0 ? domains : undefined;
}
