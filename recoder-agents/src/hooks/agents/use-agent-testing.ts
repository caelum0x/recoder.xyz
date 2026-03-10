import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  getTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  startTestRun,
  getTestRuns,
  getTestRunDetail,
  type TestCase,
  type TestCaseListResponse,
  type CreateTestCaseRequest,
  type UpdateTestCaseRequest,
  type TestRun,
  type TestRunListResponse,
  type TestRunDetailResponse,
} from '@/lib/api/agent-testing';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const testingKeys = {
  all: ['agent-testing'] as const,
  cases: (agentId: string) => [...testingKeys.all, 'cases', agentId] as const,
  runs: (agentId: string) => [...testingKeys.all, 'runs', agentId] as const,
  runDetail: (agentId: string, runId: string) =>
    [...testingKeys.all, 'run-detail', agentId, runId] as const,
};

// ---------------------------------------------------------------------------
// Test Cases hooks
// ---------------------------------------------------------------------------

export const useTestCases = (agentId: string) => {
  return useQuery<TestCaseListResponse>({
    queryKey: testingKeys.cases(agentId),
    queryFn: () => getTestCases(agentId),
    enabled: !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
  });
};

export const useCreateTestCase = () => {
  const queryClient = useQueryClient();

  return useMutation<TestCase, Error, { agentId: string; data: CreateTestCaseRequest }>({
    mutationFn: ({ agentId, data }) => createTestCase(agentId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: testingKeys.cases(agentId) });
      toast.success('Test case created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create test case');
    },
  });
};

export const useUpdateTestCase = () => {
  const queryClient = useQueryClient();

  return useMutation<
    TestCase,
    Error,
    { agentId: string; caseId: string; data: UpdateTestCaseRequest }
  >({
    mutationFn: ({ agentId, caseId, data }) => updateTestCase(agentId, caseId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: testingKeys.cases(agentId) });
      toast.success('Test case updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update test case');
    },
  });
};

export const useDeleteTestCase = () => {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: boolean }, Error, { agentId: string; caseId: string }>({
    mutationFn: ({ agentId, caseId }) => deleteTestCase(agentId, caseId),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: testingKeys.cases(agentId) });
      toast.success('Test case deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete test case');
    },
  });
};

// ---------------------------------------------------------------------------
// Test Runs hooks
// ---------------------------------------------------------------------------

export const useStartTestRun = () => {
  const queryClient = useQueryClient();

  return useMutation<TestRun, Error, { agentId: string }>({
    mutationFn: ({ agentId }) => startTestRun(agentId),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: testingKeys.runs(agentId) });
      toast.success('Test run started');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start test run');
    },
  });
};

export const useTestRuns = (agentId: string) => {
  return useQuery<TestRunListResponse>({
    queryKey: testingKeys.runs(agentId),
    queryFn: () => getTestRuns(agentId),
    enabled: !!agentId,
    staleTime: 30000,
    refetchOnMount: 'always',
  });
};

export const useTestRunDetail = (agentId: string, runId: string) => {
  return useQuery<TestRunDetailResponse>({
    queryKey: testingKeys.runDetail(agentId, runId),
    queryFn: () => getTestRunDetail(agentId, runId),
    enabled: !!agentId && !!runId,
    staleTime: 15000,
    refetchOnMount: 'always',
  });
};

export type { TestCase, TestRun, TestRunDetailResponse, TestCaseListResponse, TestRunListResponse };
