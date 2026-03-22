import { backendApi } from '@/lib/api-client';

export interface RecoveryPlaybook {
  id: string;
  playbook_name: string;
  description?: string;
  error_pattern: string;
  error_type: string;
  recovery_steps: Array<{ step?: number; action: string; timeout_seconds?: number }>;
  auto_execute: boolean;
  max_retries: number;
  cooldown_seconds: number;
  is_active: boolean;
  trigger_count: number;
  success_count: number;
  created_at: string;
}

export interface RecoveryExecution {
  id: string;
  playbook_id: string;
  agent_id?: string;
  error_message?: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  steps_completed: number;
  execution_log: Array<{ step: number; action: string; result: string }>;
  started_at: string;
  completed_at?: string;
}

export interface PlaybookStats {
  total_playbooks: number;
  overall_success_rate: number;
  by_error_type: Record<string, number>;
}

export async function listPlaybooks(params?: { error_type?: string }) {
  const qs = new URLSearchParams();
  if (params?.error_type) qs.set('error_type', params.error_type);
  const response = await backendApi.get<RecoveryPlaybook[]>(`/playbooks?${qs}`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getPlaybookStats() {
  const response = await backendApi.get<PlaybookStats>('/playbooks/stats');
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function getPlaybook(id: string) {
  const response = await backendApi.get<RecoveryPlaybook>(`/playbooks/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function createPlaybook(data: {
  playbook_name: string;
  error_pattern: string;
  recovery_steps: unknown[];
  description?: string;
  error_type?: string;
  auto_execute?: boolean;
  max_retries?: number;
  cooldown_seconds?: number;
}) {
  const response = await backendApi.post<RecoveryPlaybook>('/playbooks', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function updatePlaybook(id: string, data: Partial<RecoveryPlaybook>) {
  const response = await backendApi.patch<RecoveryPlaybook>(`/playbooks/${id}`, data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function deletePlaybook(id: string) {
  const response = await backendApi.delete(`/playbooks/${id}`);
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function executePlaybook(
  id: string,
  data?: { agent_id?: string; error_message?: string }
) {
  const response = await backendApi.post<RecoveryExecution>(
    `/playbooks/${id}/execute`,
    data ?? {}
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}

export async function listPlaybookExecutions(playbookId: string) {
  const response = await backendApi.get<RecoveryExecution[]>(
    `/playbooks/${playbookId}/executions`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
}
