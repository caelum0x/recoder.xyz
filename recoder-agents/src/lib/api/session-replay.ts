import { backendApi } from '@/lib/api-client';
import { handleApiError } from '@/lib/error-handler';

// ============================================================================
// Types
// ============================================================================

export interface SessionRecording {
  id: string;
  user_id: string;
  thread_id: string;
  agent_id: string | null;
  run_id: string | null;
  event_count: number;
  duration_ms: number;
  status: 'recording' | 'completed' | 'archived';
  started_at: string;
  completed_at: string | null;
}

export interface SessionRecordingDetail extends SessionRecording {
  events: RecordingEvent[];
}

export interface RecordingEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface SessionBookmark {
  id: string;
  recording_id: string;
  user_id: string;
  event_index: number;
  label: string;
  note: string | null;
  created_at: string;
}

export interface StartRecordingRequest {
  thread_id: string;
  agent_id?: string;
  run_id?: string;
}

export interface AppendEventsRequest {
  events: RecordingEvent[];
}

export interface AddBookmarkRequest {
  event_index: number;
  label: string;
  note?: string;
}

export interface RecordingFilters {
  thread_id?: string;
  agent_id?: string;
  status?: string;
  limit?: number;
}

// ============================================================================
// API Functions
// ============================================================================

export async function startRecording(
  body: StartRecordingRequest,
): Promise<SessionRecording> {
  try {
    const response = await backendApi.post<SessionRecording>(
      '/sessions/recordings',
      body,
      { showErrors: false },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'start recording', resource: 'session-replay' });
    throw error;
  }
}

export async function appendEvents(
  recordingId: string,
  body: AppendEventsRequest,
): Promise<{ id: string; event_count: number; duration_ms: number }> {
  try {
    const response = await backendApi.post<{ id: string; event_count: number; duration_ms: number }>(
      `/sessions/recordings/${recordingId}/events`,
      body,
      { showErrors: false },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'append events', resource: 'session-replay' });
    throw error;
  }
}

export async function completeRecording(
  recordingId: string,
): Promise<SessionRecording> {
  try {
    const response = await backendApi.post<SessionRecording>(
      `/sessions/recordings/${recordingId}/complete`,
      {},
      { showErrors: false },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'complete recording', resource: 'session-replay' });
    throw error;
  }
}

export async function getRecordings(
  filters?: RecordingFilters,
): Promise<SessionRecording[]> {
  try {
    const searchParams = new URLSearchParams();
    if (filters?.thread_id) searchParams.set('thread_id', filters.thread_id);
    if (filters?.agent_id) searchParams.set('agent_id', filters.agent_id);
    if (filters?.status) searchParams.set('status', filters.status);
    if (filters?.limit) searchParams.set('limit', String(filters.limit));
    const qs = searchParams.toString();

    const response = await backendApi.get<SessionRecording[]>(
      `/sessions/recordings${qs ? `?${qs}` : ''}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list recordings', resource: 'session-replay' });
    throw error;
  }
}

export async function getRecordingDetail(
  recordingId: string,
): Promise<SessionRecordingDetail> {
  try {
    const response = await backendApi.get<SessionRecordingDetail>(
      `/sessions/recordings/${recordingId}`,
      { showErrors: false },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get recording detail', resource: 'session-replay' });
    throw error;
  }
}

export async function addBookmark(
  recordingId: string,
  body: AddBookmarkRequest,
): Promise<SessionBookmark> {
  try {
    const response = await backendApi.post<SessionBookmark>(
      `/sessions/recordings/${recordingId}/bookmarks`,
      body,
      { showErrors: false },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'add bookmark', resource: 'session-replay' });
    throw error;
  }
}

export async function getRecordingBookmarks(
  recordingId: string,
): Promise<SessionBookmark[]> {
  try {
    const response = await backendApi.get<SessionBookmark[]>(
      `/sessions/recordings/${recordingId}/bookmarks`,
      { showErrors: false },
    );
    if (response.error) throw new Error(response.error.message);
    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get recording bookmarks', resource: 'session-replay' });
    throw error;
  }
}
