import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { submitFeedback, getFeedback, type FeedbackRequest } from '@/lib/api/feedback';
import { toast } from '@/lib/toast';

export function useFeedback(params?: { thread_id?: string; message_id?: string }) {
  return useQuery({
    queryKey: ['feedback', params?.thread_id, params?.message_id],
    queryFn: () => getFeedback(params),
    enabled: !!(params?.thread_id || params?.message_id),
    staleTime: 30000,
  });
}

export function useSubmitFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: FeedbackRequest) => submitFeedback(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      toast.success('Thanks for your feedback!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit feedback');
    },
  });
}
