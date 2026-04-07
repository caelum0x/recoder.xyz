"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_PROVIDERS = void 0;
exports.validateProviderKeyFormats = validateProviderKeyFormats;
exports.getAvailableProviders = getAvailableProviders;
exports.normalizeByokKeysPayload = normalizeByokKeysPayload;
exports.buildInternalServiceHeaders = buildInternalServiceHeaders;
exports.fetchUserByokProviderKeys = fetchUserByokProviderKeys;
const crypto_1 = __importDefault(require("crypto"));
const byok_key_cache_1 = require("../byok-key-cache");
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
/**
 * Known providers in priority order (first match wins in generatePromptCompletion).
 */
exports.SUPPORTED_PROVIDERS = [
    'openrouter',
    'openai',
    'groq',
    'deepseek',
    'anthropic',
    'google',
];
/**
 * Lightweight key-prefix heuristics per provider.
 * A key passes validation if it starts with one of the listed prefixes.
 * An empty list means "any non-empty string is accepted" (escape hatch for unknown providers).
 */
const KEY_PREFIX_HINTS = {
    openai: ['sk-'],
    anthropic: ['sk-ant-'],
    google: ['AI'],
    groq: ['gsk_'],
    deepseek: ['sk-'],
    openrouter: ['sk-or-'],
};
/**
 * Validate BYOK key format heuristically. Returns warnings (not blocking).
 */
function validateProviderKeyFormats(keys) {
    const warnings = [];
    for (const [provider, value] of Object.entries(keys)) {
        if (!value)
            continue;
        const prefixes = KEY_PREFIX_HINTS[provider];
        if (!prefixes || prefixes.length === 0)
            continue;
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
function getAvailableProviders(keys) {
    return exports.SUPPORTED_PROVIDERS.filter((p) => Boolean(keys[p]));
}
function normalizeByokKeysPayload(payload) {
    if (!isRecord(payload))
        return {};
    const rawKeys = payload.keys;
    if (!isRecord(rawKeys))
        return {};
    const normalized = {};
    for (const [provider, rawValue] of Object.entries(rawKeys)) {
        if (typeof rawValue !== 'string')
            continue;
        const value = rawValue.trim();
        if (!value)
            continue;
        normalized[provider] = value;
    }
    return normalized;
}
function sha256(input) {
    return crypto_1.default.createHash('sha256').update(input).digest('hex');
}
function buildInternalServiceHeaders(input) {
    const timestamp = String(input.timestampMs ?? Date.now());
    const nonce = input.nonce || crypto_1.default.randomUUID();
    const payload = [
        timestamp,
        nonce,
        input.method.toUpperCase(),
        input.pathname,
        sha256(input.body),
    ].join('.');
    const signature = crypto_1.default
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
async function fetchUserByokProviderKeys(options) {
    const { appApiUrl, userId, serviceKey } = options;
    // Check encrypted cache first
    const cached = await (0, byok_key_cache_1.getCachedKeys)(userId);
    if (cached)
        return cached;
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
    await (0, byok_key_cache_1.setCachedKeys)(userId, keys);
    return keys;
}
