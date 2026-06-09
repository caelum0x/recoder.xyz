'use client';

import { useQuery } from '@tanstack/react-query';

// docker-backend's agent capability layer, proxied same-origin via /dx/* (see
// next.config.ts rewrites). Shapes mirror GET /api/capabilities.

export interface RuntimeCatalogEntry {
  type: string;
  label: string;
  description: string;
  basedOn?: string;
  available: boolean;
}

export interface CapabilitiesResponse {
  codingRuntimes: { available: boolean; runtimes: string[]; catalog: RuntimeCatalogEntry[] };
  secureRunner: { available: boolean; sdkInstalled: boolean; apiKeyPresent: boolean; reason?: string };
  browserVerification: { deterministic: boolean; ai: boolean; reason?: string };
  agentMemory: { available: boolean; mode: string; vectorStore?: string; llmProvider?: string; embedderProvider?: string; reason?: string };
  libraryDocs: { available: boolean; apiKeyPresent: boolean; base: string };
  codeIntelligence: { available: boolean };
  llmRouter: { available: boolean; providers: number; configured: number };
  agentSkills: { available: boolean; trackedAgents: number };
  zeroTrustNetwork: { available: boolean; configured: boolean; controllerUrl?: string; reason?: string };
  billing?: { available: boolean; configured: boolean; server: string; organizationId?: string; reason?: string };
  agentCollaboration?: { available: boolean; squads: number };
}

async function fetchCapabilities(): Promise<CapabilitiesResponse> {
  const response = await fetch('/dx/capabilities', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Capabilities request failed (${response.status})`);
  }
  const json = await response.json();
  // docker-backend wraps responses as { success, data }; tolerate both.
  return (json?.data ?? json) as CapabilitiesResponse;
}

export const capabilitiesKeys = {
  all: ['capabilities'] as const,
};

export function useCapabilities() {
  return useQuery<CapabilitiesResponse>({
    queryKey: capabilitiesKeys.all,
    queryFn: fetchCapabilities,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
