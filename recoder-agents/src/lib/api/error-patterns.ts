import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface ErrorPattern {
  id: string;
  pattern_name: string;
  error_signature: string;
  occurrence_count: number;
  affected_agents: string[];
  first_seen_at: string;
  last_seen_at: string;
  status: 'active' | 'investigating' | 'resolved' | 'muted';
  resolution?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  sample_errors: Array<{
    agent_id: string;
    error: string;
    timestamp: string;
  }>;
}

export interface ErrorPatternFilters {
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateErrorPatternData {
  status?: string;
  resolution?: string;
  severity?: string;
}

export interface ErrorPatternStats {
  active_count: number;
  by_severity: Record<string, number>;
  most_frequent: Array<{
    id: string;
    pattern_name: string;
    occurrence_count: number;
    severity: string;
  }>;
  trending: Array<{
    id: string;
    pattern_name: string;
    occurrence_count: number;
    severity: string;
  }>;
}

export interface ScanResult {
  patterns_found: number;
  patterns_created: number;
  patterns_updated: number;
}

// ============================================================================
// API Functions
// ============================================================================

export const scanErrorPatterns = async (): Promise<ScanResult> => {
  const response = await backendApi.post<ScanResult>(
    '/error-patterns/scan',
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to scan error patterns: ${response.error.message}`);
  }

  return response.data!;
};

export const getErrorPatterns = async (filters?: ErrorPatternFilters): Promise<ErrorPattern[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const query = params.toString();
  const url = `/error-patterns${query ? `?${query}` : ''}`;

  const response = await backendApi.get<ErrorPattern[]>(url, {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to fetch error patterns: ${response.error.message}`);
  }

  return response.data ?? [];
};

export const getErrorPattern = async (patternId: string): Promise<ErrorPattern> => {
  const response = await backendApi.get<ErrorPattern>(
    `/error-patterns/${patternId}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch error pattern: ${response.error.message}`);
  }

  return response.data!;
};

export const updateErrorPattern = async (
  patternId: string,
  data: UpdateErrorPatternData
): Promise<ErrorPattern> => {
  const response = await backendApi.patch<ErrorPattern>(
    `/error-patterns/${patternId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to update error pattern: ${response.error.message}`);
  }

  return response.data!;
};

export const getErrorPatternStats = async (): Promise<ErrorPatternStats> => {
  const response = await backendApi.get<ErrorPatternStats>(
    '/error-patterns/stats',
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch error pattern stats: ${response.error.message}`);
  }

  return response.data!;
};
