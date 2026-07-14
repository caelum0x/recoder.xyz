/**
 * normalizeLocalPreviewUrl — validate + normalize a dev-server preview URL before
 * it is persisted to `workspace.metadata.previewUrl`.
 *
 * The cockpit Run tab sniffs a LOCAL dev-server URL out of the session output
 * (see cockpit's `extractPreviewUrl`) and POSTs it here. Only an http(s)
 * localhost/loopback URL is accepted: this value later feeds the agent-facing
 * preview-engine which `fetch`es it (preview.health), so persisting an arbitrary
 * host would be an SSRF footgun. Anything that is not a loopback dev URL returns
 * null (the caller rejects with a 400 rather than writing it).
 *
 * 0.0.0.0 / 127.0.0.1 are normalized to `localhost` so the stored link is
 * clickable, mirroring the client-side extractor's normalization. Pure + tested.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function normalizeLocalPreviewUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  // URL wraps IPv6 hosts in brackets ("[::1]"); strip them before matching.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!LOOPBACK_HOSTS.has(host)) return null;

  // Normalize the wildcard/loopback IPs to `localhost` so the stored URL opens.
  if (host === '0.0.0.0' || host === '127.0.0.1') {
    parsed.hostname = 'localhost';
  }

  return parsed.toString();
}
