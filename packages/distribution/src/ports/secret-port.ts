/**
 * Secret retrieval port. Secrets come from env/vault only; a required-but-
 * missing secret fails fast (it never silently degrades to a hardcoded value).
 */
export interface SecretPort {
  /** Return the secret value, or undefined when absent. */
  get(name: string): string | undefined;
  /** True when the secret is present and non-empty. */
  has(name: string): boolean;
  /** Return the secret or throw a fail-fast error naming the missing key. */
  require(name: string): string;
}

/**
 * The default env-backed secret port. Reads from a provided env record
 * (defaults to `process.env`). Never logs values.
 */
export function createEnvSecretPort(
  env: Record<string, string | undefined> = process.env,
): SecretPort {
  return {
    get(name) {
      const v = env[name];
      return v && v.length > 0 ? v : undefined;
    },
    has(name) {
      const v = env[name];
      return typeof v === 'string' && v.length > 0;
    },
    require(name) {
      const v = env[name];
      if (!v || v.length === 0) {
        throw new Error(`required secret missing: ${name}`);
      }
      return v;
    },
  };
}
