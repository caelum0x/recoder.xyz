import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface SandboxResourceSnapshot {
  id: string;
  user_id: string;
  sandbox_id: string;
  agent_id: string | null;
  cpu_percent: number | null;
  memory_mb: number | null;
  disk_mb: number | null;
  network_in_kb: number | null;
  network_out_kb: number | null;
  process_count: number | null;
  status: 'running' | 'idle' | 'stopped' | 'error';
  captured_at: string;
}

export interface ActiveSandbox {
  sandbox_id: string;
  agent_id: string | null;
  cpu_percent: number | null;
  memory_mb: number | null;
  disk_mb: number | null;
  network_in_kb: number | null;
  network_out_kb: number | null;
  process_count: number | null;
  status: 'running' | 'idle' | 'stopped' | 'error';
  captured_at: string;
}

export interface ResourceSummary {
  total_sandboxes: number;
  running_sandboxes: number;
  total_memory_mb: number;
  total_cpu_percent: number;
  avg_cpu_percent: number;
  avg_memory_mb: number;
  total_network_in_kb: number;
  total_network_out_kb: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const getActiveSandboxes = async (): Promise<ActiveSandbox[]> => {
  const response = await backendApi.get<ActiveSandbox[]>(
    '/sandbox/resources',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch active sandboxes: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const getSandboxResourceHistory = async (
  sandboxId: string,
  hours: number = 24
): Promise<SandboxResourceSnapshot[]> => {
  const response = await backendApi.get<SandboxResourceSnapshot[]>(
    `/sandbox/${sandboxId}/resources/history?hours=${hours}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch resource history: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const getSandboxResourceSummary = async (): Promise<ResourceSummary> => {
  const response = await backendApi.get<ResourceSummary>(
    '/sandbox/resources/summary',
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch resource summary: ${response.error.message}`);
  }

  return response.data!;
};

export const recordSandboxSnapshot = async (
  sandboxId: string,
  data: {
    agent_id?: string;
    cpu_percent?: number;
    memory_mb?: number;
    disk_mb?: number;
    network_in_kb?: number;
    network_out_kb?: number;
    process_count?: number;
    status?: string;
  }
): Promise<{ success: boolean; id?: string; captured_at?: string }> => {
  const response = await backendApi.post<{
    success: boolean;
    id?: string;
    captured_at?: string;
  }>(`/sandbox/${sandboxId}/resources/snapshot`, data, { showErrors: true });

  if (response.error) {
    throw new Error(`Failed to record snapshot: ${response.error.message}`);
  }

  return response.data!;
};
