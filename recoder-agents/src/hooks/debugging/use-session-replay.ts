import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  startRecording,
  appendEvents,
  completeRecording,
  getRecordings,
  getRecordingDetail,
  addBookmark,
  getRecordingBookmarks,
  type StartRecordingRequest,
  type AppendEventsRequest,
  type AddBookmarkRequest,
  type RecordingFilters,
} from '@/lib/api/session-replay';

export function useRecordings(filters?: RecordingFilters) {
  return useQuery({
    queryKey: ['session-recordings', filters],
    queryFn: () => getRecordings(filters),
    staleTime: 15000,
  });
}

export function useRecordingDetail(recordingId: string | null) {
  return useQuery({
    queryKey: ['session-recording-detail', recordingId],
    queryFn: () => getRecordingDetail(recordingId!),
    enabled: !!recordingId,
    staleTime: 10000,
  });
}

export function useRecordingBookmarks(recordingId: string | null) {
  return useQuery({
    queryKey: ['session-recording-bookmarks', recordingId],
    queryFn: () => getRecordingBookmarks(recordingId!),
    enabled: !!recordingId,
    staleTime: 10000,
  });
}

export function useStartRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StartRecordingRequest) => startRecording(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-recordings'] });
      toast.success('Recording started');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start recording');
    },
  });
}

export function useAppendEvents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recordingId, body }: { recordingId: string; body: AppendEventsRequest }) =>
      appendEvents(recordingId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['session-recording-detail', variables.recordingId],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to append events');
    },
  });
}

export function useCompleteRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordingId: string) => completeRecording(recordingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-recordings'] });
      toast.success('Recording completed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to complete recording');
    },
  });
}

export function useAddBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      recordingId,
      body,
    }: {
      recordingId: string;
      body: AddBookmarkRequest;
    }) => addBookmark(recordingId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['session-recording-bookmarks', variables.recordingId],
      });
      toast.success('Bookmark added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add bookmark');
    },
  });
}
