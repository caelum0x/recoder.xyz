/**
 * Redact secrets from strings/objects before they are emitted or journaled.
 * Enforcement-only: it never decides policy, it just scrubs known-sensitive shapes.
 */
const DEFAULT_SECRET_PATTERNS: readonly RegExp[] = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/g, // provider-style keys
  /\bghp_[A-Za-z0-9]{20,}\b/g, // github tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // aws access key id
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, // bearer tokens
  /\beyJ[A-Za-z0-9._-]{20,}\b/g, // jwt-ish
];

/** Env var name fragments whose values must always be masked. */
const SENSITIVE_KEY_FRAGMENTS = ['secret', 'token', 'password', 'apikey', 'api_key', 'private_key'];

export const REDACTION_PLACEHOLDER = '[REDACTED]';

export class SecretRedactor {
  private readonly patterns: readonly RegExp[];

  constructor(extraPatternSources: readonly string[] = []) {
    const extra = extraPatternSources
      .map((src) => safeRegExp(src))
      .filter((re): re is RegExp => re !== null);
    this.patterns = [...DEFAULT_SECRET_PATTERNS, ...extra];
  }

  redactString(input: string): string {
    let out = input;
    for (const pattern of this.patterns) {
      out = out.replace(pattern, REDACTION_PLACEHOLDER);
    }
    return out;
  }

  /** Deep-redact a JSON-ish value, masking sensitive keys entirely. */
  redactValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.redactString(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redactValue(item));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        out[key] = isSensitiveKey(key) ? REDACTION_PLACEHOLDER : this.redactValue(child);
      }
      return out;
    }
    return value;
  }
}

export function createSecretRedactor(extraPatternSources: readonly string[] = []): SecretRedactor {
  return new SecretRedactor(extraPatternSources);
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

function safeRegExp(source: string): RegExp | null {
  try {
    return new RegExp(source, 'g');
  } catch {
    return null;
  }
}
