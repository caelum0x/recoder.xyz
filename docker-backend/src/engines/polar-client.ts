/**
 * @module polar-client
 *
 * Fail-safe billing via Polar (polarsource/polar, Apache-2.0) — the optional
 * billing pillar. Plain HTTP against the Polar API so it works against the
 * managed service, the sandbox, or a self-hosted Polar instance
 * (`POLAR_SERVER_URL`) with no SDK version coupling.
 *
 * Purely additive — it does NOT touch Recoder's existing entitlement/billing
 * logic. Strictly fail-safe per the billing rules: when `POLAR_ACCESS_TOKEN`
 * is missing, health reports `available: false` with a truthful reason and
 * every call returns an explicit error. It never reports a fake success.
 */

import { createLogger } from './logger';

const logger = createLogger('polar-client');

function serverUrl(): string {
  if (process.env.POLAR_SERVER_URL) return process.env.POLAR_SERVER_URL.replace(/\/$/, '');
  return process.env.POLAR_SERVER === 'sandbox' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
}

function isConfigured(): boolean {
  return !!process.env.POLAR_ACCESS_TOKEN;
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
  };
}

export interface PolarHealth {
  available: boolean;
  configured: boolean;
  server: string;
  organizationId?: string;
  reason?: string;
}

async function api<T>(method: string, path: string, body?: unknown, timeoutMs = 20_000): Promise<T> {
  if (!isConfigured()) throw new Error('POLAR_ACCESS_TOKEN is not configured');
  const response = await fetch(`${serverUrl()}${path}`, {
    method,
    headers: headers(),
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = json?.detail || json?.error || `HTTP ${response.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  return json as T;
}

export async function polarHealth(): Promise<PolarHealth> {
  const server = serverUrl();
  const organizationId = process.env.POLAR_ORGANIZATION_ID;
  if (!isConfigured()) {
    return { available: false, configured: false, server, organizationId, reason: 'POLAR_ACCESS_TOKEN not set' };
  }
  try {
    // Cheap authenticated probe.
    await api('GET', '/v1/products/?limit=1');
    return { available: true, configured: true, server, organizationId };
  } catch (err) {
    return { available: false, configured: true, server, organizationId, reason: err instanceof Error ? err.message : 'Polar unreachable' };
  }
}

export interface PolarProduct {
  id: string;
  name: string;
  [key: string]: unknown;
}

export async function listProducts(): Promise<{ available: boolean; products: PolarProduct[]; reason?: string }> {
  if (!isConfigured()) return { available: false, products: [], reason: 'Polar not configured' };
  try {
    const orgId = process.env.POLAR_ORGANIZATION_ID;
    const query = orgId ? `?organization_id=${encodeURIComponent(orgId)}&limit=100` : '?limit=100';
    const result = await api<{ items?: PolarProduct[] }>('GET', `/v1/products/${query}`);
    return { available: true, products: Array.isArray(result?.items) ? result.items : [] };
  } catch (err) {
    logger.warn({ err }, 'Polar listProducts failed');
    return { available: false, products: [], reason: err instanceof Error ? err.message : 'list failed' };
  }
}

export interface CreateCheckoutParams {
  products: string[];
  successUrl?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export async function createCheckout(
  params: CreateCheckoutParams,
): Promise<{ available: boolean; checkoutUrl?: string; id?: string; reason?: string }> {
  if (!isConfigured()) return { available: false, reason: 'Polar not configured' };
  if (!Array.isArray(params.products) || params.products.length === 0) {
    return { available: true, reason: 'products (non-empty array of product IDs) is required' };
  }
  try {
    const body: Record<string, unknown> = { products: params.products };
    if (params.successUrl) body.success_url = params.successUrl;
    if (params.customerEmail) body.customer_email = params.customerEmail;
    if (params.metadata) body.metadata = params.metadata;
    const result = await api<{ id?: string; url?: string }>('POST', '/v1/checkouts/', body);
    return { available: true, id: result?.id, checkoutUrl: result?.url };
  } catch (err) {
    logger.error({ err }, 'Polar createCheckout failed');
    return { available: true, reason: err instanceof Error ? err.message : 'checkout failed' };
  }
}

export async function listSubscriptions(
  customerId?: string,
): Promise<{ available: boolean; subscriptions: unknown[]; reason?: string }> {
  if (!isConfigured()) return { available: false, subscriptions: [], reason: 'Polar not configured' };
  try {
    const params = new URLSearchParams({ limit: '100' });
    if (process.env.POLAR_ORGANIZATION_ID) params.set('organization_id', process.env.POLAR_ORGANIZATION_ID);
    if (customerId) params.set('customer_id', customerId);
    const result = await api<{ items?: unknown[] }>('GET', `/v1/subscriptions/?${params.toString()}`);
    return { available: true, subscriptions: Array.isArray(result?.items) ? result.items : [] };
  } catch (err) {
    logger.warn({ err }, 'Polar listSubscriptions failed');
    return { available: false, subscriptions: [], reason: err instanceof Error ? err.message : 'list failed' };
  }
}
