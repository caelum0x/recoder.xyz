/**
 * @module ziti-client
 *
 * Zero-trust connectivity control plane via OpenZiti (openziti/ziti) — the
 * "secure runner/tunnel layer" pillar. Talks to a Ziti controller's Edge
 * Management REST API (no native SDK / no exposed ports) to provision
 * zero-trust identities and enrollment tokens for runners and agents, so they
 * can join the overlay and reach services without inbound network exposure.
 *
 * Recoder already uses zrok (which is built on OpenZiti) for agent push
 * tunnels; this adds direct identity/enrollment provisioning for self-hosted
 * runners. Fail-safe: unconfigured or unreachable controller reports a truthful
 * status and every call returns an explicit error — it never fakes enrollment.
 */

import { createLogger } from './logger';

const logger = createLogger('ziti-client');

const EDGE_MGMT_PATH = '/edge/management/v1';

function controllerUrl(): string | undefined {
  const url = process.env.ZITI_CONTROLLER_URL;
  return url ? url.replace(/\/$/, '') : undefined;
}

function isConfigured(): boolean {
  return !!(
    controllerUrl() &&
    (process.env.ZITI_API_TOKEN || (process.env.ZITI_ADMIN_USERNAME && process.env.ZITI_ADMIN_PASSWORD))
  );
}

export interface ZitiHealth {
  available: boolean;
  configured: boolean;
  controllerUrl?: string;
  reason?: string;
}

export interface ZitiIdentity {
  id: string;
  name: string;
  isAdmin?: boolean;
  enrollmentJwt?: string;
  [key: string]: unknown;
}

// Cached management session token.
let session: { token: string; expiresAt: number } | null = null;

async function api<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const base = controllerUrl();
  if (!base) throw new Error('ZITI_CONTROLLER_URL is not configured');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['zt-session'] = token;

  const response = await fetch(`${base}${EDGE_MGMT_PATH}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = json?.error?.message || json?.error?.code || `HTTP ${response.status}`;
    throw new Error(`Ziti API ${method} ${path} failed: ${message}`);
  }
  return json as T;
}

async function authenticate(): Promise<string> {
  if (process.env.ZITI_API_TOKEN) return process.env.ZITI_API_TOKEN;

  if (session && session.expiresAt > Date.now() + 30_000) {
    return session.token;
  }

  const result = await api<{ data?: { token?: string; expiresAt?: string } }>(
    'POST',
    '/authenticate?method=password',
    { username: process.env.ZITI_ADMIN_USERNAME, password: process.env.ZITI_ADMIN_PASSWORD },
  );
  const token = result?.data?.token;
  if (!token) throw new Error('Ziti authentication returned no session token');

  const expiresAt = result.data?.expiresAt ? Date.parse(result.data.expiresAt) : Date.now() + 25 * 60 * 1000;
  session = { token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 25 * 60 * 1000 };
  return token;
}

export async function zitiHealth(): Promise<ZitiHealth> {
  const url = controllerUrl();
  if (!isConfigured()) {
    return {
      available: false,
      configured: false,
      controllerUrl: url,
      reason: 'Set ZITI_CONTROLLER_URL and ZITI_API_TOKEN (or ZITI_ADMIN_USERNAME/PASSWORD)',
    };
  }
  try {
    await authenticate();
    return { available: true, configured: true, controllerUrl: url };
  } catch (err) {
    return {
      available: false,
      configured: true,
      controllerUrl: url,
      reason: err instanceof Error ? err.message : 'Ziti controller unreachable',
    };
  }
}

export async function listIdentities(filter?: string): Promise<{ available: boolean; identities: ZitiIdentity[]; reason?: string }> {
  if (!isConfigured()) return { available: false, identities: [], reason: 'Ziti not configured' };
  try {
    const token = await authenticate();
    const query = filter ? `?filter=${encodeURIComponent(filter)}` : '';
    const result = await api<{ data?: ZitiIdentity[] }>('GET', `/identities${query}`, undefined, token);
    return { available: true, identities: Array.isArray(result?.data) ? result.data : [] };
  } catch (err) {
    logger.warn({ err }, 'Ziti listIdentities failed');
    return { available: false, identities: [], reason: err instanceof Error ? err.message : 'list failed' };
  }
}

/**
 * Create a zero-trust identity (default: a one-time-token enrollment for a
 * runner). Returns the identity id and the enrollment JWT the runner uses to
 * join the overlay.
 */
export async function createIdentity(params: {
  name: string;
  isAdmin?: boolean;
  roleAttributes?: string[];
}): Promise<{ available: boolean; identity?: ZitiIdentity; reason?: string }> {
  if (!isConfigured()) return { available: false, reason: 'Ziti not configured' };
  try {
    const token = await authenticate();
    const created = await api<{ data?: { id?: string } }>(
      'POST',
      '/identities',
      {
        name: params.name,
        type: 'Device',
        isAdmin: params.isAdmin ?? false,
        enrollment: { ott: true },
        roleAttributes: params.roleAttributes ?? [],
      },
      token,
    );
    const id = created?.data?.id;
    if (!id) throw new Error('Ziti identity creation returned no id');

    // Fetch the created identity to surface the enrollment JWT.
    const detail = await api<{ data?: ZitiIdentity & { enrollment?: { ott?: { jwt?: string } } } }>(
      'GET',
      `/identities/${id}`,
      undefined,
      token,
    );
    const enrollmentJwt = detail?.data?.enrollment?.ott?.jwt;
    return {
      available: true,
      identity: { id, name: params.name, isAdmin: params.isAdmin ?? false, enrollmentJwt },
    };
  } catch (err) {
    logger.error({ err, name: params.name }, 'Ziti createIdentity failed');
    return { available: false, reason: err instanceof Error ? err.message : 'create failed' };
  }
}

/** Convenience: provision a runner identity tagged `recoder-runner`. */
export async function provisionRunnerIdentity(
  name: string,
): Promise<{ available: boolean; identity?: ZitiIdentity; reason?: string }> {
  return createIdentity({ name, isAdmin: false, roleAttributes: ['recoder-runner'] });
}

export async function deleteIdentity(id: string): Promise<{ available: boolean; deleted: boolean; reason?: string }> {
  if (!isConfigured()) return { available: false, deleted: false, reason: 'Ziti not configured' };
  try {
    const token = await authenticate();
    await api('DELETE', `/identities/${encodeURIComponent(id)}`, undefined, token);
    return { available: true, deleted: true };
  } catch (err) {
    logger.warn({ err, id }, 'Ziti deleteIdentity failed');
    return { available: false, deleted: false, reason: err instanceof Error ? err.message : 'delete failed' };
  }
}
