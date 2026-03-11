import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  id: string;
  user_id: string;
  agent_id: string | null;
  name: string;
  max_retries: number;
  retry_delay_seconds: number;
  backoff_multiplier: number;
  retry_on_errors: string[];
  is_active: boolean;
  created_at: string;
}

export interface CreateRetryPolicyRequest {
  agent_id?: string | null;
  name: string;
  max_retries?: number;
  retry_delay_seconds?: number;
  backoff_multiplier?: number;
  retry_on_errors?: string[];
}

export interface RetryAttempt {
  id: string;
  user_id: string;
  original_run_id: string;
  retry_run_id: string | null;
  agent_id: string;
  attempt_number: number;
  error_type: string | null;
  error_message: string | null;
  status: 'pending' | 'retrying' | 'succeeded' | 'failed' | 'exhausted';
  scheduled_at: string | null;
  executed_at: string | null;
  created_at: string;
}

export interface ManualRetryRequest {
  override_input?: string;
}

export interface RetryStats {
  total_retries: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  most_retried_agent: string | null;
  most_retried_agent_count: number;
  avg_attempts: number;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const listRetryPolicies = async (): Promise<RetryPolicy[]> => {
  const response = await backendApi.get<RetryPolicy[]>('/retry/policies', {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to list retry policies: ${response.error.message}`);
  }

  return response.data!;
};

export const createRetryPolicy = async (
  data: CreateRetryPolicyRequest
): Promise<RetryPolicy> => {
  const response = await backendApi.post<RetryPolicy>(
    '/retry/policies',
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create retry policy: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteRetryPolicy = async (policyId: string): Promise<void> => {
  const response = await backendApi.delete(`/retry/policies/${policyId}`, {
    showErrors: true,
  });

  if (response.error) {
    throw new Error(`Failed to delete retry policy: ${response.error.message}`);
  }
};

export const retryRun = async (
  runId: string,
  data?: ManualRetryRequest
): Promise<RetryAttempt> => {
  const response = await backendApi.post<RetryAttempt>(
    `/runs/${runId}/retry`,
    data || {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to retry run: ${response.error.message}`);
  }

  return response.data!;
};

export const listRetryAttempts = async (
  runId: string
): Promise<RetryAttempt[]> => {
  const response = await backendApi.get<RetryAttempt[]>(
    `/runs/${runId}/retry-attempts`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to list retry attempts: ${response.error.message}`);
  }

  return response.data!;
};

export const getRetryStats = async (): Promise<RetryStats> => {
  const response = await backendApi.get<RetryStats>('/retry/stats', {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    throw new Error(`Failed to get retry stats: ${response.error.message}`);
  }

  return response.data!;
};
