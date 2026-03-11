'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createSandboxSession,
  sendSandboxMessage,
  getSandboxSession,
  endSandboxSession,
  createSandboxTestCase,
  getSandboxTestCases,
  runSandboxTestCase,
  deleteSandboxTestCase,
  type SandboxSession,
  type CreateSandboxData,
  type SendMessageData,
  type SendMessageResponse,
  type SandboxTestCase,
  type CreateTestCaseData,
  type RunTestCaseResult,
} from '@/lib/api/agent-sandbox';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const sandboxKeys = {
  all: ['agent-sandbox'] as const,
  session: (agentId: string, sessionId: string) =>
    [...sandboxKeys.all, 'session', agentId, sessionId] as const,
  testCases: (agentId: string) =>
    [...sandboxKeys.all, 'test-cases', agentId] as const,
} as const;

// ---------------------------------------------------------------------------
// Sandbox Session Hooks
// ---------------------------------------------------------------------------

/**
 * Create a new sandbox session for an agent.
 */
export function useCreateSandbox() {
  const queryClient = useQueryClient();

  return useMutation<SandboxSession, Error, { agentId: string; data?: CreateSandboxData }>({
    mutationFn: ({ agentId, data }) => createSandboxSession(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sandboxKeys.all });
    },
  });
}

/**
 * Send a message to a sandbox session.
 */
export function useSendSandboxMessage() {
  const queryClient = useQueryClient();

  return useMutation<
    SendMessageResponse,
    Error,
    { agentId: string; sessionId: string; data: SendMessageData }
  >({
    mutationFn: ({ agentId, sessionId, data }) =>
      sendSandboxMessage(agentId, sessionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: sandboxKeys.session(variables.agentId, variables.sessionId),
      });
    },
  });
}

/**
 * Fetch a sandbox session with all messages.
 */
export function useSandboxSession(
  agentId: string,
  sessionId: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery<SandboxSession>({
    queryKey: sandboxKeys.session(agentId, sessionId ?? ''),
    queryFn: () => getSandboxSession(agentId, sessionId!),
    staleTime: 5_000,
    gcTime: 30_000,
    enabled: !!sessionId && options?.enabled !== false,
  });
}

/**
 * End (complete) a sandbox session.
 */
export function useEndSandbox() {
  const queryClient = useQueryClient();

  return useMutation<
    { deleted: boolean; session_id: string },
    Error,
    { agentId: string; sessionId: string }
  >({
    mutationFn: ({ agentId, sessionId }) => endSandboxSession(agentId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sandboxKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Test Case Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch test cases for an agent.
 */
export function useTestCases(agentId: string, options?: { enabled?: boolean }) {
  return useQuery<{ test_cases: SandboxTestCase[] }>({
    queryKey: sandboxKeys.testCases(agentId),
    queryFn: () => getSandboxTestCases(agentId),
    staleTime: 10_000,
    gcTime: 60_000,
    enabled: options?.enabled !== false,
  });
}

/**
 * Create a test case for an agent.
 */
export function useCreateTestCase() {
  const queryClient = useQueryClient();

  return useMutation<SandboxTestCase, Error, { agentId: string; data: CreateTestCaseData }>({
    mutationFn: ({ agentId, data }) => createSandboxTestCase(agentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: sandboxKeys.testCases(variables.agentId),
      });
    },
  });
}

/**
 * Run a test case. Invalidates test cases on success.
 */
export function useRunTestCase() {
  const queryClient = useQueryClient();

  return useMutation<RunTestCaseResult, Error, { agentId: string; caseId: string }>({
    mutationFn: ({ agentId, caseId }) => runSandboxTestCase(agentId, caseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: sandboxKeys.testCases(variables.agentId),
      });
    },
  });
}

/**
 * Delete a test case.
 */
export function useDeleteTestCase() {
  const queryClient = useQueryClient();

  return useMutation<
    { deleted: boolean; case_id: string },
    Error,
    { agentId: string; caseId: string }
  >({
    mutationFn: ({ agentId, caseId }) => deleteSandboxTestCase(agentId, caseId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: sandboxKeys.testCases(variables.agentId),
      });
    },
  });
}
