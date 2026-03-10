import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createAbTest,
  getAbTests,
  getAbTest,
  updateAbTest,
  deleteAbTest,
  recordTrial,
  getAbTestResults,
  type CreateAbTestData,
  type UpdateAbTestData,
  type RecordTrialData,
} from '@/lib/api/ab-tests';

export function useAbTests(status?: string) {
  return useQuery({
    queryKey: ['ab-tests', status],
    queryFn: () => getAbTests(status),
    staleTime: 30_000,
  });
}

export function useAbTest(testId: string) {
  return useQuery({
    queryKey: ['ab-tests', 'detail', testId],
    queryFn: () => getAbTest(testId),
    enabled: !!testId,
    staleTime: 15_000,
  });
}

export function useAbTestResults(testId: string) {
  return useQuery({
    queryKey: ['ab-tests', 'results', testId],
    queryFn: () => getAbTestResults(testId),
    enabled: !!testId,
    staleTime: 15_000,
  });
}

export function useCreateAbTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAbTestData) => createAbTest(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ab-tests'] });
    },
  });
}

export function useUpdateAbTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      testId,
      data,
    }: {
      testId: string;
      data: UpdateAbTestData;
    }) => updateAbTest(testId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['ab-tests'] });
      qc.invalidateQueries({ queryKey: ['ab-tests', 'detail', variables.testId] });
      qc.invalidateQueries({ queryKey: ['ab-tests', 'results', variables.testId] });
    },
  });
}

export function useDeleteAbTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) => deleteAbTest(testId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ab-tests'] });
    },
  });
}

export function useRecordTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      testId,
      data,
    }: {
      testId: string;
      data: RecordTrialData;
    }) => recordTrial(testId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['ab-tests'] });
      qc.invalidateQueries({ queryKey: ['ab-tests', 'detail', variables.testId] });
      qc.invalidateQueries({ queryKey: ['ab-tests', 'results', variables.testId] });
    },
  });
}
