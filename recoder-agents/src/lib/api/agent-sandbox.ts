import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface SandboxSession {
  id: string;
  user_id: string;
  agent_id: string;
  sandbox_config: Record<string, unknown>;
  messages: SandboxMessage[];
  status: 'active' | 'completed' | 'expired';
  expires_at: string;
  created_at: string;
}

export interface SandboxMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface CreateSandboxData {
  sandbox_config?: Record<string, unknown>;
  expires_minutes?: number;
}

export interface SendMessageData {
  content: string;
  role?: string;
}

export interface SendMessageResponse {
  user_message: SandboxMessage;
  assistant_message: SandboxMessage;
  session: SandboxSession;
}

export interface SandboxTestCase {
  id: string;
  user_id: string;
  agent_id: string;
  name: string;
  input_message: string;
  expected_behavior?: string | null;
  last_result?: {
    passed: boolean;
    response: string;
    sandbox_session_id: string;
    timestamp: string;
  } | null;
  pass_count: number;
  fail_count: number;
  created_at: string;
}

export interface CreateTestCaseData {
  name: string;
  input_message: string;
  expected_behavior?: string;
}

export interface RunTestCaseResult {
  test_case_id: string;
  passed: boolean;
  result: {
    passed: boolean;
    response: string;
    sandbox_session_id: string;
    timestamp: string;
  };
}

// ============================================================================
// Sandbox Session API
// ============================================================================

export const createSandboxSession = async (
  agentId: string,
  data?: CreateSandboxData
): Promise<SandboxSession> => {
  const response = await backendApi.post<SandboxSession>(
    `/agents/${agentId}/sandbox`,
    data ?? {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create sandbox session: ${response.error.message}`);
  }

  return response.data!;
};

export const sendSandboxMessage = async (
  agentId: string,
  sessionId: string,
  data: SendMessageData
): Promise<SendMessageResponse> => {
  const response = await backendApi.post<SendMessageResponse>(
    `/agents/${agentId}/sandbox/${sessionId}/message`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to send sandbox message: ${response.error.message}`);
  }

  return response.data!;
};

export const getSandboxSession = async (
  agentId: string,
  sessionId: string
): Promise<SandboxSession> => {
  const response = await backendApi.get<SandboxSession>(
    `/agents/${agentId}/sandbox/${sessionId}`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch sandbox session: ${response.error.message}`);
  }

  return response.data!;
};

export const endSandboxSession = async (
  agentId: string,
  sessionId: string
): Promise<{ deleted: boolean; session_id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; session_id: string }>(
    `/agents/${agentId}/sandbox/${sessionId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to end sandbox session: ${response.error.message}`);
  }

  return response.data!;
};

// ============================================================================
// Test Case API
// ============================================================================

export const createSandboxTestCase = async (
  agentId: string,
  data: CreateTestCaseData
): Promise<SandboxTestCase> => {
  const response = await backendApi.post<SandboxTestCase>(
    `/agents/${agentId}/test-cases`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to create test case: ${response.error.message}`);
  }

  return response.data!;
};

export const getSandboxTestCases = async (
  agentId: string
): Promise<{ test_cases: SandboxTestCase[] }> => {
  const response = await backendApi.get<{ test_cases: SandboxTestCase[] }>(
    `/agents/${agentId}/test-cases`,
    { showErrors: true, cache: 'no-store' }
  );

  if (response.error) {
    throw new Error(`Failed to fetch test cases: ${response.error.message}`);
  }

  return response.data!;
};

export const runSandboxTestCase = async (
  agentId: string,
  caseId: string
): Promise<RunTestCaseResult> => {
  const response = await backendApi.post<RunTestCaseResult>(
    `/agents/${agentId}/test-cases/${caseId}/run`,
    {},
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to run test case: ${response.error.message}`);
  }

  return response.data!;
};

export const deleteSandboxTestCase = async (
  agentId: string,
  caseId: string
): Promise<{ deleted: boolean; case_id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; case_id: string }>(
    `/agents/${agentId}/test-cases/${caseId}`,
    { showErrors: true }
  );

  if (response.error) {
    throw new Error(`Failed to delete test case: ${response.error.message}`);
  }

  return response.data!;
};
