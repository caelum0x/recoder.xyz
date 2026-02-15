type UnknownRecord = Record<string, unknown>;

function ensureRecord(payload: unknown): UnknownRecord | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload as UnknownRecord;
}

function ensureOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function parseAuthProviderJson(payload: unknown): UnknownRecord | null {
  return ensureRecord(payload);
}

export function parseAuthProviderError(payload: unknown): UnknownRecord | null {
  const base = ensureRecord(payload);
  if (!base) {
    return null;
  }

  const error = ensureRecord(base.error);
  if (error) {
    return error;
  }

  return base;
}

export function parseAuthProviderProfileResponse(payload: unknown): UnknownRecord | null {
  return ensureRecord(payload);
}

export function readAuthProviderErrorMessage(payload: unknown): string | null {
  const record = ensureRecord(payload);
  if (!record) {
    return null;
  }

  return (
    ensureOptionalString(record.message) ||
    ensureOptionalString(record.error_description) ||
    ensureOptionalString(record.error)
  );
}

export type AccountInitializationResponse = {
  success: boolean;
  message?: string;
  subscription_id?: string;
};

export function parseAccountInitializationResponse(payload: unknown): AccountInitializationResponse | null {
  const record = ensureRecord(payload);
  if (!record) {
    return null;
  }

  const success = record.success;
  if (typeof success !== 'boolean') {
    return null;
  }

  return {
    success,
    message: ensureOptionalString(record.message) || undefined,
    subscription_id: ensureOptionalString(record.subscription_id) || undefined,
  };
}

export type ProviderKeysResponse = {
  keys: Record<string, string>;
};

export function parseProviderKeysResponse(payload: unknown): ProviderKeysResponse | null {
  const record = ensureRecord(payload);
  if (!record) {
    return null;
  }

  const keysRaw = ensureRecord(record.keys);
  if (!keysRaw) {
    return { keys: {} };
  }

  const keys: Record<string, string> = {};
  for (const [provider, value] of Object.entries(keysRaw)) {
    if (typeof value === 'string') {
      keys[provider] = value;
    }
  }

  return { keys };
}
