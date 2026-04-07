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
/**
 * Known providers in priority order (first match wins in generatePromptCompletion).
 */
export declare const SUPPORTED_PROVIDERS: readonly ["openrouter", "openai", "groq", "deepseek", "anthropic", "google"];
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];
export interface KeyValidationWarning {
    provider: string;
    message: string;
}
/**
 * Validate BYOK key format heuristically. Returns warnings (not blocking).
 */
export declare function validateProviderKeyFormats(keys: AIProviderKeys): KeyValidationWarning[];
/**
 * Return the list of providers for which the user has configured a key.
 */
export declare function getAvailableProviders(keys: AIProviderKeys): string[];
export declare function normalizeByokKeysPayload(payload: unknown): AIProviderKeys;
export declare function buildInternalServiceHeaders(input: {
    method: string;
    pathname: string;
    body: string;
    serviceKey: string;
    timestampMs?: number;
    nonce?: string;
    requestId?: string;
}): Headers;
export declare function fetchUserByokProviderKeys(options: FetchByokKeysOptions): Promise<AIProviderKeys>;
export {};
