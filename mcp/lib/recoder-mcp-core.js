'use strict';
/**
 * recoder-mcp-core
 *
 * Pure, side-effect-free helpers shared by the Recoder MCP surfaces
 * (recoder-a2a-server.js and recoder-codex-adapter.js).
 *
 * Everything here is a pure function of its arguments so it can be unit-tested
 * without opening sockets, reading stdin, or hitting the network. Functions
 * build request shapes + auth headers and parse {success,error} envelopes —
 * they never fabricate success.
 */

const crypto = require('node:crypto');

/**
 * True when `value` is a Recoder platform API key pair (pk_...:sk_...).
 * These authenticate against the Python "agents" API via the x-api-key header.
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecoderApiKeyPair(value) {
  if (!value || typeof value !== 'string' || !value.includes(':')) return false;
  const [publicKey, secretKey] = value.split(':', 2);
  return publicKey.startsWith('pk_') && secretKey.startsWith('sk_');
}

/**
 * Resolve the raw env credentials into the two distinct auth materials Recoder
 * uses: a pk_/sk_ API key (Python agents API) vs. a bearer session token
 * (docker control plane). A pk_/sk_ pair is never also used as a bearer token.
 *
 * @param {{ apiToken?: string, sessionToken?: string }} env
 * @returns {{ pythonApiKey: string, platformToken: string }}
 */
function resolveCredentials(env = {}) {
  const rawAuthToken = env.apiToken || '';
  const pythonApiKey = isRecoderApiKeyPair(rawAuthToken) ? rawAuthToken : '';
  const rawSession = env.sessionToken || (pythonApiKey ? '' : rawAuthToken);
  let platformToken = rawSession;
  try { platformToken = decodeURIComponent(rawSession); } catch { platformToken = rawSession; }
  return { pythonApiKey, platformToken };
}

/**
 * Build headers for the docker/A2A control plane (bearer session token).
 * @param {{ platformToken?: string }} creds
 * @param {Record<string,string>} [extraHeaders]
 */
function buildPlatformHeaders(creds, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (creds && creds.platformToken) headers.Authorization = `Bearer ${creds.platformToken}`;
  return headers;
}

/**
 * Build headers for the Python agents API. Prefers the pk_/sk_ key via
 * x-api-key, falling back to a bearer session token.
 * @param {{ pythonApiKey?: string, platformToken?: string }} creds
 * @param {Record<string,string>} [extraHeaders]
 */
function buildPythonApiHeaders(creds, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (creds && creds.pythonApiKey) headers['x-api-key'] = creds.pythonApiKey;
  else if (creds && creds.platformToken) headers.Authorization = `Bearer ${creds.platformToken}`;
  return headers;
}

/** Any credential usable against the Python agents API. */
function hasPythonApiAuth(creds) {
  return Boolean(creds && (creds.pythonApiKey || creds.platformToken));
}

/** A bearer token usable against the docker control plane. */
function hasPlatformAuth(creds) {
  return Boolean(creds && creds.platformToken);
}

/**
 * Parse a fetch Response without ever throwing on non-JSON / empty bodies.
 * Returns a structured result so callers can produce a truthful error.
 * @param {{ ok: boolean, status: number, text: () => Promise<string> }} res
 * @returns {Promise<{ ok: boolean, status: number, data: any, text: string }>}
 */
async function readJsonResponse(res) {
  const text = await res.text().catch(() => '');
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  return { ok: res.ok, status: res.status, data, text };
}

/**
 * Extract a human-readable message from a parsed API error envelope.
 * Recognizes both the Recoder {success,error:{message}} envelope and common
 * {message}/{detail}/{error} shapes.
 * @param {{ data: any, text: string, status: number }} parsed
 * @returns {string}
 */
function extractApiError(parsed) {
  const { data, text, status } = parsed || {};
  if (data && typeof data === 'object') {
    const err = data.error;
    const msg = (err && typeof err === 'object' ? err.message : err) || data.message || data.detail;
    if (msg) return typeof msg === 'string' ? msg : JSON.stringify(msg);
  }
  if (text) return String(text).slice(0, 200);
  return `HTTP ${status}`;
}

/**
 * Normalize a Daytona base URL to its `/api` root, validating the URL.
 * Throws a clear error on an invalid URL instead of silently mangling it.
 * @param {string} value
 * @returns {string}
 */
function normalizeDaytonaApiUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (err) {
    throw new Error(`Invalid RECODER_DAYTONA_URL: ${err.message}`);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  if (!parsed.pathname.endsWith('/api')) {
    parsed.pathname = `${parsed.pathname}/api`.replace(/\/+/g, '/');
  }
  return parsed.toString().replace(/\/$/, '');
}

/** True when a URL points at the local loopback host. */
function isLocalUrl(value) {
  try {
    const parsed = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Compute the HMAC signature headers for a signed A2A request. Returns an empty
 * object when no signing secret is configured (signing is optional).
 * @param {{ method: string, url: string, body?: string, secret?: string, timestamp?: string }} input
 * @returns {Record<string,string>}
 */
function signRequest({ method, url, body = '', secret, timestamp }) {
  if (!secret) return {};
  const ts = timestamp || new Date().toISOString();
  const payload = `${String(method).toUpperCase()}\n${new URL(url).pathname}\n${ts}\n${body}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return {
    'X-Recoder-A2A-Timestamp': ts,
    'X-Recoder-A2A-Signature': signature,
  };
}

/**
 * Build the standard Daytona create-sandbox request body. Uses the field names
 * the Recoder backend / Daytona API expect: `snapshot` (not `image`) and
 * `autoStopInterval` (not `auto_stop_interval`).
 * @param {{ snapshot?: string, autoStopInterval?: number, public?: boolean }} [opts]
 */
function buildDaytonaCreateBody(opts = {}) {
  return {
    snapshot: opts.snapshot || 'daytonaio/sandbox:0.5.0-slim',
    public: opts.public !== undefined ? opts.public : true,
    autoStopInterval: opts.autoStopInterval !== undefined ? opts.autoStopInterval : 10,
  };
}

module.exports = {
  isRecoderApiKeyPair,
  resolveCredentials,
  buildPlatformHeaders,
  buildPythonApiHeaders,
  hasPythonApiAuth,
  hasPlatformAuth,
  readJsonResponse,
  extractApiError,
  normalizeDaytonaApiUrl,
  isLocalUrl,
  signRequest,
  buildDaytonaCreateBody,
};
