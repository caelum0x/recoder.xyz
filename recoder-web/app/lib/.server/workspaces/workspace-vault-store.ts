import { parseMasterKey, encryptV1, decryptV1, isVaultV1 } from '@giselles-ai/vault/node-crypto';

export interface WorkspaceSecret {
  id: string;
  workspaceId?: string;
  label: string;
  encryptedValue?: string;
  rawValue: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

const secretStore = new Map<string, WorkspaceSecret>();

export function generateSecretId(): string {
  return `sec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function encryptSecretValue(plaintext: string): string {
  const key = parseMasterKey(process.env.VAULT_MASTER_KEY);
  if (!key) {
    // Dev fallback: Base64 encoding (no real encryption)
    return Buffer.from(plaintext).toString('base64');
  }
  return encryptV1(plaintext, key);
}

export function decryptSecretValue(ciphertext: string): string {
  if (isVaultV1(ciphertext)) {
    const key = parseMasterKey(process.env.VAULT_MASTER_KEY);
    if (!key) {
      throw new Error('VAULT_MASTER_KEY required to decrypt vault:v1: secrets');
    }
    return decryptV1(ciphertext, key);
  }
  // Legacy Base64 fallback
  return Buffer.from(ciphertext, 'base64').toString('utf8');
}

export function maskSecretValue(value: string): string {
  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }
  return value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4);
}

export function getSecret(secretId: string): WorkspaceSecret | undefined {
  return secretStore.get(secretId);
}

export function listSecretsForWorkspace(workspaceId: string): WorkspaceSecret[] {
  return Array.from(secretStore.values()).filter((secret) => !secret.workspaceId || secret.workspaceId === workspaceId);
}

export function findWorkspaceSecretByLabel(workspaceId: string | undefined, label: string): WorkspaceSecret | undefined {
  return Array.from(secretStore.values()).find((secret) => secret.workspaceId === workspaceId && secret.label === label);
}

export function addSecret(secret: WorkspaceSecret): void {
  secretStore.set(secret.id, secret);
}

export function deleteSecret(secretId: string): boolean {
  return secretStore.delete(secretId);
}

export function copySecretsToWorkspace(
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
  userId: string,
): { copied: number; skipped: number } {
  const sourceSecrets = listSecretsForWorkspace(sourceWorkspaceId).filter((secret) => secret.workspaceId === sourceWorkspaceId);
  let copied = 0;
  let skipped = 0;

  for (const secret of sourceSecrets) {
    const existing = findWorkspaceSecretByLabel(targetWorkspaceId, secret.label);
    if (existing) {
      skipped += 1;
      continue;
    }

    const now = new Date().toISOString();
    const metadata = { ...(secret.metadata || {}) };
    delete (metadata as Record<string, unknown>).copiedFromSecretId;

    addSecret({
      id: generateSecretId(),
      workspaceId: targetWorkspaceId,
      label: secret.label,
      encryptedValue: secret.encryptedValue || encryptSecretValue(secret.rawValue),
      rawValue: secret.rawValue,
      tags: secret.tags ? [...secret.tags] : undefined,
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...metadata,
        userId,
        copiedFromSecretId: secret.id,
        copiedAt: now,
      },
    });
    copied += 1;
  }

  return { copied, skipped };
}
