import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getThreadTemplates,
  createThreadTemplate,
  deleteThreadTemplate,
  createThreadFromTemplate,
} from '@/lib/api/thread-templates';
import { useRouter } from 'next/navigation';

export function useThreadTemplates(category?: string) {
  return useQuery({
    queryKey: ['thread-templates', category],
    queryFn: () => getThreadTemplates(category),
    staleTime: 30_000,
  });
}

export function useCreateThreadTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createThreadTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['thread-templates'] }),
  });
}

export function useDeleteThreadTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteThreadTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['thread-templates'] }),
  });
}

export function useCreateThreadFromTemplate() {
  const router = useRouter();
  return useMutation({
    mutationFn: createThreadFromTemplate,
    onSuccess: (data) => {
      router.push(`/thread/${data.thread_id}`);
    },
  });
}
