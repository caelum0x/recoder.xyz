import type { RuntimePolicy } from '@recoder/agent-runtimes';
import { SecretRedactor } from '../../policy/secret-redactor';

export type EnvBuildInput = {
  /** Base environment to inherit from (defaults to a minimal allow-list, NOT full process.env). */
  base?: Readonly<Record<string, string | undefined>>;
  /** Explicit overrides set by the driver (e.g. output-format flags as env). */
  overrides?: Readonly<Record<string, string>>;
  /** BYOK provider keys to inject for this run (never logged). */
  byokKeys?: Readonly<Record<string, string>>;
  policy: Pick<RuntimePolicy, 'allowNetwork'>;
  /** Extra redaction pattern sources from config. */
  redactionPatterns?: readonly string[];
};

/** Default env keys safe to pass through to a child CLI (no secrets implied by name). */
const PASSTHROUGH_KEYS = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'SHELL', 'USER'];

/**
 * Assemble a child env: policy-scoped, with BYOK keys injected. The returned env is the
 * concrete map the child sees. Secret VALUES are preserved (the child needs them); the
 * redactor is returned alongside so callers redact env before LOGGING it, never the live env.
 */
export function buildChildEnv(input: EnvBuildInput): {
  env: Record<string, string>;
  redactor: SecretRedactor;
} {
  const base = input.base ?? process.env;
  const env: Record<string, string> = {};

  for (const key of PASSTHROUGH_KEYS) {
    const value = base[key];
    if (typeof value === 'string') env[key] = value;
  }

  if (!input.policy.allowNetwork) {
    // Signal offline intent to well-behaved CLIs; per-driver flags enforce the rest.
    env['RECODER_RUNTIME_OFFLINE'] = '1';
  }

  Object.assign(env, input.overrides ?? {});
  Object.assign(env, input.byokKeys ?? {});

  const redactor = new SecretRedactor(input.redactionPatterns ?? []);
  return { env, redactor };
}

/** Produce a log-safe copy of an env map (secret keys/values masked). */
export function redactEnvForLog(
  env: Readonly<Record<string, string>>,
  redactor: SecretRedactor,
): Record<string, unknown> {
  return redactor.redactValue(env) as Record<string, unknown>;
}
