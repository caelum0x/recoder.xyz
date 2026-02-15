import crypto from 'crypto';
import { getCachedKeys, setCachedKeys } from '../byok-key-cache';

export interface AIProviderKeys {
  openrouter?: string;
  openai?: string;
  anthropic?: string;
  google?: string;
  groq?: string;
  deepseek?: string;
  [key: string]: string | undefined;
}

interface FetchByokKeysOptions {
  appApiUrl: string;
  userId: string;
  serviceKey: string;
  signal?: AbortSignal;
  requestId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Known providers in priority order (first match wins in generatePromptCompletion).
 */
export const SUPPORTED_PROVIDERS = [
  'openrouter',
  'openai',
  'groq',
  'deepseek',
  'anthropic',
  'google',
] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Lightweight key-prefix heuristics per provider.
 * A key passes validation if it starts with one of the listed prefixes.
 * An empty list means "any non-empty string is accepted" (escape hatch for unknown providers).
 */
const KEY_PREFIX_HINTS: Record<string, string[]> = {
  openai: ['sk-'],
  anthropic: ['sk-ant-'],
  google: ['AI'],
  groq: ['gsk_'],
  deepseek: ['sk-'],
  openrouter: ['sk-or-'],
};

export interface KeyValidationWarning {
  provider: string;
  message: string;
}

/**
 * Validate BYOK key format heuristically. Returns warnings (not blocking).
 */
export function validateProviderKeyFormats(keys: AIProviderKeys): KeyValidationWarning[] {
  const warnings: KeyValidationWarning[] = [];
  for (const [provider, value] of Object.entries(keys)) {
    if (!value) continue;
    const prefixes = KEY_PREFIX_HINTS[provider];
    if (!prefixes || prefixes.length === 0) continue;
    if (!prefixes.some((prefix) => value.startsWith(prefix))) {
      warnings.push({
        provider,
        message: `Key for ${provider} doesn't match expected prefix (${prefixes.join(' or ')}). It may not work.`,
      });
    }
  }
  return warnings;
}

/**
 * Return the list of providers for which the user has configured a key.
 */
export function getAvailableProviders(keys: AIProviderKeys): string[] {
  return SUPPORTED_PROVIDERS.filter((p) => Boolean(keys[p]));
}

export function normalizeByokKeysPayload(payload: unknown): AIProviderKeys {
  if (!isRecord(payload)) return {};
  const rawKeys = payload.keys;
  if (!isRecord(rawKeys)) return {};

  const normalized: AIProviderKeys = {};
  for (const [provider, rawValue] of Object.entries(rawKeys)) {
    if (typeof rawValue !== 'string') continue;
    const value = rawValue.trim();
    if (!value) continue;
    normalized[provider] = value;
  }
  return normalized;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function buildInternalServiceHeaders(input: {
  method: string;
  pathname: string;
  body: string;
  serviceKey: string;
  timestampMs?: number;
  nonce?: string;
  requestId?: string;
}): Headers {
  const timestamp = String(input.timestampMs ?? Date.now());
  const nonce = input.nonce || crypto.randomUUID();
  const payload = [
    timestamp,
    nonce,
    input.method.toUpperCase(),
    input.pathname,
    sha256(input.body),
  ].join('.');

  const signature = crypto
    .createHmac('sha256', input.serviceKey)
    .update(payload)
    .digest('hex');

  const headers = new Headers({
    'Content-Type': 'application/json',
    'x-internal-service-key': input.serviceKey,
    'x-internal-timestamp': timestamp,
    'x-internal-nonce': nonce,
    'x-internal-signature': signature,
  });
  if (input.requestId) {
    headers.set('X-Request-ID', input.requestId);
  }
  return headers;
}

export async function fetchUserByokProviderKeys(
  options: FetchByokKeysOptions,
): Promise<AIProviderKeys> {
  const { appApiUrl, userId, serviceKey } = options;

  // Check encrypted cache first
  const cached = await getCachedKeys(userId);
  if (cached) return cached;

  const pathname = '/api/user/ai-provider-keys';
  const body = JSON.stringify({
    userId,
  });
  const headers = buildInternalServiceHeaders({
    method: 'PUT',
    pathname,
    body,
    serviceKey,
    requestId: options.requestId,
  });

  const response = await fetch(`${appApiUrl}${pathname}`, {
    method: 'PUT',
    headers,
    body,
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to retrieve BYOK keys: ${response.status} ${errorText}`);
  }

  const payload = await response.json().catch(() => ({}));
  const keys = normalizeByokKeysPayload(payload);

  // Populate encrypted cache (no-op if VAULT_MASTER_KEY is not set)
  await setCachedKeys(userId, keys);

  return keys;
}
