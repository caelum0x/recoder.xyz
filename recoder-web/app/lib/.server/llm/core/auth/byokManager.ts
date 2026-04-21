/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BYOKConfig, BYOKProvider, ProviderCredentials } from './types.js';

/**
 * BYOK (Bring Your Own Key) Manager
 * Manages API keys from multiple AI providers
 */
export class BYOKManager {
  private config: BYOKConfig;
  private credentials: ProviderCredentials;

  constructor() {
    this.config = {
      providers: {},
    };
    this.credentials = {};
  }

  /**
   * Add a provider credential
   */
  addProvider(
    providerName: keyof ProviderCredentials,
    apiKey: string,
    baseUrl?: string,
    organization?: string,
  ): void {
    const credential: any = { apiKey };
    if (baseUrl) credential.baseUrl = baseUrl;
    if (organization) credential.organization = organization;

    this.credentials[providerName] = credential;
  }

  /**
   * Remove a provider credential
   */
  removeProvider(providerName: keyof ProviderCredentials): void {
    delete this.credentials[providerName];
  }

  /**
   * Get provider credential
   */
  getProvider(providerName: keyof ProviderCredentials): any {
    return this.credentials[providerName];
  }

  /**
   * Get all configured providers
   */
  getAllProviders(): ProviderCredentials {
    return { ...this.credentials };
  }

  /**
   * Check if a provider is configured
   */
  hasProvider(providerName: keyof ProviderCredentials): boolean {
    return !!this.credentials[providerName]?.apiKey;
  }

  /**
   * List all available (configured) providers
   */
  listAvailableProviders(): Array<{
    id: string;
    name: string;
    configured: boolean;
    hasBaseUrl: boolean;
  }> {
    const allProviders: Array<keyof ProviderCredentials> = [
      'openai',
      'anthropic',
      'google',
      'cohere',
      'together',
      'perplexity',
      'mistral',
      'groq',
    ];

    return allProviders.map((provider) => ({
      id: provider,
      name: provider,
      configured: this.hasProvider(provider),
      hasBaseUrl: !!this.credentials[provider]?.baseUrl,
    }));
  }

  /**
   * Get OpenRouter routing config for BYOK mode
   * This tells OpenRouter to use user's own API keys
   */
  getOpenRouterBYOKConfig(): Record<string, any> {
    const config: Record<string, any> = {
      provider: {
        // Allow user's own providers
        allow_user_api_keys: true,
        require_user_api_keys: true,
      },
    };

    // Add provider-specific credentials
    const providers: Record<string, string> = {};

    if (this.credentials.openai?.apiKey) {
      providers['openai'] = this.credentials.openai.apiKey;
    }

    if (this.credentials.anthropic?.apiKey) {
      providers['anthropic'] = this.credentials.anthropic.apiKey;
    }

    if (this.credentials.google?.apiKey) {
      providers['google'] = this.credentials.google.apiKey;
    }

    if (this.credentials.cohere?.apiKey) {
      providers['cohere'] = this.credentials.cohere.apiKey;
    }

    if (this.credentials.together?.apiKey) {
      providers['together'] = this.credentials.together.apiKey;
    }

    if (this.credentials.perplexity?.apiKey) {
      providers['perplexity'] = this.credentials.perplexity.apiKey;
    }

    if (this.credentials.mistral?.apiKey) {
      providers['mistral'] = this.credentials.mistral.apiKey;
    }

    if (this.credentials.groq?.apiKey) {
      providers['groq'] = this.credentials.groq.apiKey;
    }

    if (Object.keys(providers).length > 0) {
      config.provider_api_keys = providers;
    }

    return config;
  }

  /**
   * Validate a provider API key
   */
  async validateProvider(
    providerName: keyof ProviderCredentials,
  ): Promise<{ valid: boolean; error?: string }> {
    const credential = this.credentials[providerName];

    if (!credential || !credential.apiKey) {
      return { valid: false, error: 'No API key configured' };
    }

    try {
      // Test the API key by making a simple request
      const baseUrls: Record<string, string> = {
        openai: 'https://api.openai.com/v1/models',
        anthropic: 'https://api.anthropic.com/v1/messages',
        google: 'https://generativelanguage.googleapis.com/v1/models',
        cohere: 'https://api.cohere.ai/v1/models',
        together: 'https://api.together.xyz/v1/models',
        perplexity: 'https://api.perplexity.ai/models',
        mistral: 'https://api.mistral.ai/v1/models',
        groq: 'https://api.groq.com/openai/v1/models',
      };

      const url = credential.baseUrl || baseUrls[providerName];
      if (!url) {
        return { valid: false, error: 'No base URL available' };
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${credential.apiKey}`,
        },
      });

      if (response.ok) {
        return { valid: true };
      }

      return {
        valid: false,
        error: `API returned ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate all configured providers
   */
  async validateAllProviders(): Promise<
    Record<string, { valid: boolean; error?: string }>
  > {
    const results: Record<string, { valid: boolean; error?: string }> = {};

    const providers = Object.keys(this.credentials) as Array<keyof ProviderCredentials>;

    for (const provider of providers) {
      results[provider] = await this.validateProvider(provider);
    }

    return results;
  }

  /**
   * Export credentials (for backup/sharing)
   * WARNING: This contains sensitive data!
   */
  exportCredentials(): string {
    return JSON.stringify(this.credentials, null, 2);
  }

  /**
   * Import credentials from JSON
   */
  importCredentials(json: string): void {
    try {
      const imported = JSON.parse(json) as ProviderCredentials;
      this.credentials = imported;
    } catch (error) {
      throw new Error(
        `Failed to import credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clear all credentials
   */
  clearAll(): void {
    this.credentials = {};
  }
}

// Singleton instance
let byokManagerInstance: BYOKManager | null = null;

export function getBYOKManager(): BYOKManager {
  if (!byokManagerInstance) {
    byokManagerInstance = new BYOKManager();
  }
  return byokManagerInstance;
}
