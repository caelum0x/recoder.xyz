import { runtimeConfigSchema, type RuntimeConfig, type RuntimeConfigInput } from '../types/runtime-config';
import { readRuntimeEnvOverrides } from './env-keys';

/**
 * Load + validate a `RuntimeConfig` from explicit input merged with documented env
 * overrides. Fails fast on invalid input (Zod). No secrets are read or inlined.
 */
export function loadRuntimeConfig(
  input: RuntimeConfigInput = {},
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const envOverrides = readRuntimeEnvOverrides(env);
  return runtimeConfigSchema.parse({ ...input, ...envOverrides });
}

/** Validate an already-shaped config object (no env merge). */
export function validateRuntimeConfig(input: unknown): RuntimeConfig {
  return runtimeConfigSchema.parse(input);
}
