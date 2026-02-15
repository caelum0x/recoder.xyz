/**
 * Secrets Store - Central state management for environment variables
 * Manages encrypted secrets and environment files
 */

import { atom, computed } from 'nanostores';

// ============================================
// Types
// ============================================

export interface Secret {
  key: string;
  value: string;
  masked: boolean;
  environment: 'development' | 'production' | 'test' | 'local';
  createdAt?: number;
  updatedAt?: number;
}

export interface EnvFile {
  name: string;
  path: string;
  secrets: Secret[];
}

// ============================================
// Atoms (Reactive State)
// ============================================

/** All secrets/env vars for current project */
export const secretsAtom = atom<Secret[]>([]);

/** Current environment being edited */
export const currentEnvironmentAtom = atom<'development' | 'production' | 'test' | 'local'>('development');

/** Loading state */
export const isLoadingSecretsAtom = atom<boolean>(false);

/** Error message */
export const secretsErrorAtom = atom<string | null>(null);

/** Whether secrets are visible (unmasked) */
export const showSecretsAtom = atom<boolean>(false);

/** Currently editing secret key */
export const editingSecretAtom = atom<string | null>(null);

// ============================================
// Computed Values
// ============================================

/** Secrets filtered by current environment */
export const filteredSecretsAtom = computed(
  [secretsAtom, currentEnvironmentAtom],
  (secrets, environment) => secrets.filter((s) => s.environment === environment)
);

/** Total secrets count */
export const secretsCountAtom = computed(secretsAtom, (secrets) => secrets.length);

/** Secrets grouped by environment */
export const secretsByEnvironmentAtom = computed(secretsAtom, (secrets) => {
  const grouped: Record<string, Secret[]> = {
    development: [],
    production: [],
    test: [],
    local: [],
  };

  for (const secret of secrets) {
    grouped[secret.environment]?.push(secret);
  }

  return grouped;
});

// ============================================
// Actions
// ============================================

/**
 * Set secrets list
 */
export function setSecrets(secrets: Secret[]): void {
  secretsAtom.set(secrets);
}

/**
 * Add or update a secret
 */
export function upsertSecret(secret: Secret): void {
  const current = secretsAtom.get();
  const index = current.findIndex(
    (s) => s.key === secret.key && s.environment === secret.environment
  );

  if (index >= 0) {
    const updated = [...current];
    updated[index] = { ...secret, updatedAt: Date.now() };
    secretsAtom.set(updated);
  } else {
    secretsAtom.set([...current, { ...secret, createdAt: Date.now() }]);
  }
}

/**
 * Remove a secret
 */
export function removeSecret(key: string, environment: string): void {
  const current = secretsAtom.get();
  secretsAtom.set(current.filter((s) => !(s.key === key && s.environment === environment)));
}

/**
 * Set current environment
 */
export function setCurrentEnvironment(env: 'development' | 'production' | 'test' | 'local'): void {
  currentEnvironmentAtom.set(env);
}

/**
 * Set loading state
 */
export function setSecretsLoading(loading: boolean): void {
  isLoadingSecretsAtom.set(loading);
}

/**
 * Set error
 */
export function setSecretsError(error: string | null): void {
  secretsErrorAtom.set(error);
}

/**
 * Toggle secrets visibility
 */
export function toggleShowSecrets(): void {
  showSecretsAtom.set(!showSecretsAtom.get());
}

/**
 * Set editing secret
 */
export function setEditingSecret(key: string | null): void {
  editingSecretAtom.set(key);
}

/**
 * Clear all secrets state
 */
export function clearSecretsState(): void {
  secretsAtom.set([]);
  secretsErrorAtom.set(null);
  editingSecretAtom.set(null);
  showSecretsAtom.set(false);
}

/**
 * Get environment file path
 */
export function getEnvFilePath(environment: string): string {
  switch (environment) {
    case 'production':
      return '.env.production';
    case 'test':
      return '.env.test';
    case 'local':
      return '.env.local';
    default:
      return '.env';
  }
}

/**
 * Parse .env file content into secrets
 */
export function parseEnvFile(content: string, environment: 'development' | 'production' | 'test' | 'local'): Secret[] {
  const secrets: Secret[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse KEY=VALUE
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      secrets.push({
        key,
        value,
        masked: true,
        environment,
      });
    }
  }

  return secrets;
}

/**
 * Serialize secrets to .env format
 */
export function serializeEnvFile(secrets: Secret[]): string {
  return secrets
    .map((s) => {
      // Quote values with spaces or special chars
      const needsQuotes = /[\s#=]/.test(s.value);
      const value = needsQuotes ? `"${s.value.replace(/"/g, '\\"')}"` : s.value;
      return `${s.key}=${value}`;
    })
    .join('\n');
}
