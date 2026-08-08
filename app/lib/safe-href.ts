/**
 * Neutralize a hyperlink URL against XSS (recoder-s0c1). A URL with NO scheme is
 * a safe relative/anchor link; a URL WITH a scheme must be in the allowlist
 * (http/https/mailto). Anything else — `javascript:`, `data:`, `vbscript:`,
 * `file:` … — is replaced with '#', so hand-rolled markdown / user-supplied link
 * targets can never render an executable href.
 */
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto']);

export function safeHref(raw: unknown): string {
  const url = String(raw ?? '').trim();
  if (!url) return '#';
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (!scheme) return url; // relative / anchor — safe
  return ALLOWED_SCHEMES.has(scheme) ? url : '#';
}
