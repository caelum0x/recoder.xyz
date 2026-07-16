/**
 * Client-side UTM Parameter Capture
 *
 * Reads UTM parameters (and referral code) from the current URL on page load,
 * persists them in sessionStorage so they survive navigation, and exposes
 * helpers to retrieve / clear the stored values before signup.
 */

const STORAGE_KEY = 'recoder_utm';

export interface StoredUTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  ref?: string;
}

const UTM_KEYS: (keyof StoredUTMParams)[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
];

/**
 * Capture UTM parameters from the current URL and store them in sessionStorage.
 * If UTM params are already stored (from an earlier page in this session) they
 * will NOT be overwritten – first-touch attribution wins.
 */
export function captureUTMParams(): void {
  if (typeof window === 'undefined') return;

  try {
    const searchParams = new URLSearchParams(window.location.search);

    // Build object from URL params
    const incoming: StoredUTMParams = {};
    let hasAny = false;

    for (const key of UTM_KEYS) {
      const value = searchParams.get(key);
      if (value) {
        incoming[key] = value.trim().slice(0, 512);
        hasAny = true;
      }
    }

    // Also accept "referralCode" and "r" as aliases for "ref"
    if (!incoming.ref) {
      const alt = searchParams.get('referralCode') || searchParams.get('r');
      if (alt) {
        incoming.ref = alt.trim().slice(0, 512);
        hasAny = true;
      }
    }

    if (!hasAny) return;

    // First-touch: only store if nothing is persisted yet
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) return;

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));
  } catch {
    // sessionStorage may be unavailable (e.g. Safari private mode quota exceeded)
  }
}

/**
 * Retrieve stored UTM parameters (if any).
 * Returns an empty object when nothing has been captured.
 */
export function getStoredUTMParams(): StoredUTMParams {
  if (typeof window === 'undefined') return {};

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredUTMParams;
  } catch {
    return {};
  }
}

/**
 * Clear stored UTM parameters.
 * Should be called after a successful signup so they are not re-sent.
 */
export function clearUTMParams(): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
