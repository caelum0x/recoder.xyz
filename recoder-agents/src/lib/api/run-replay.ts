import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplayStep {
  id: string;
  run_id: string;
  agent_id: string;
  thread_id: string;
  step_index: number;
  step_type: 'user_input' | 'llm_call' | 'tool_call' | 'tool_result' | 'assistant_output' | 'error';
  content: Record<string, any>;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost: number;
  timestamp: string;
}

export interface RunReplayResponse {
  run_id: string;
  agent_id: string;
  steps: ReplayStep[];
  total_steps: number;
}

export interface ReplaySummary {
  run_id: string;
  agent_id: string;
  total_steps: number;
  step_type_counts: Record<string, number>;
  total_tokens_in: number;
  total_tokens_out: number;
  total_latency_ms: number;
  total_cost: number;
  first_step_at: string | null;
  last_step_at: string | null;
}

export interface CaptureReplayStepRequest {
  step_index: number;
  step_type: ReplayStep['step_type'];
  content: Record<string, any>;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
  cost?: number;
  thread_id?: string;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const getRunReplay = async (
  agentId: string,
  runId: string
): Promise<RunReplayResponse> => {
  const response = await backendApi.get<RunReplayResponse>(
    `/agents/${agentId}/runs/${runId}/replay`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch run replay: ${response.error.message}`);
  }

  return response.data!;
};

export const getRunReplaySummary = async (
  agentId: string,
  runId: string
): Promise<ReplaySummary> => {
  const response = await backendApi.get<ReplaySummary>(
    `/agents/${agentId}/runs/${runId}/replay/summary`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch replay summary: ${response.error.message}`);
  }

  return response.data!;
};

export const captureReplayStep = async (
  agentId: string,
  runId: string,
  step: CaptureReplayStepRequest
): Promise<ReplayStep> => {
  const response = await backendApi.post<ReplayStep>(
    `/agents/${agentId}/runs/${runId}/replay/capture`,
    step,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to capture replay step: ${response.error.message}`);
  }

  return response.data!;
};
