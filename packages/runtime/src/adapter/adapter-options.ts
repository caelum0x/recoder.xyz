import type { AgentCapability, AgentSurface } from '@recoder/agent-os';
import type { RuntimeDriver } from '../contracts/runtime-driver';
import type { RuntimeConfig } from '../types/runtime-config';
import { DEFAULT_RUNTIME_CONFIG } from '../config/defaults';

export type AdapterOptions = {
  id: string;
  kind: AgentSurface | 'browser_agent';
  capabilities: readonly AgentCapability[];
  config: RuntimeConfig;
};

/** Resolve id/kind/capabilities for an adapter from its driver descriptor + config. */
export function resolveAdapterOptions(
  driver: RuntimeDriver,
  overrides: { id?: string; config?: RuntimeConfig } = {},
): AdapterOptions {
  const descriptor = driver.descriptor;
  return {
    id: overrides.id ?? descriptor.id,
    kind: descriptor.kind,
    capabilities: descriptor.capabilities,
    config: overrides.config ?? DEFAULT_RUNTIME_CONFIG,
  };
}

export function runtimeIdOf(options: Pick<AdapterOptions, 'id' | 'kind'>): string {
  return `${options.kind}:${options.id}`;
}
