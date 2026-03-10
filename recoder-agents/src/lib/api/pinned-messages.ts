import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface PinnedMessage {
  id: string;
  user_id: string;
  thread_id: string;
  message_index: number;
  message_preview: string | null;
  pin_note: string | null;
  pin_color: 'default' | 'important' | 'reference' | 'todo';
  pinned_at: string;
}

export interface PinMessageRequest {
  message_index: number;
  message_preview?: string;
  pin_note?: string;
  pin_color?: string;
}

export interface UpdatePinRequest {
  pin_note?: string;
  pin_color?: string;
}

// ============================================================================
// API Functions
// ============================================================================

export async function listPinnedMessages(threadId: string): Promise<PinnedMessage[]> {
  const response = await backendApi.get<PinnedMessage[]>(`/threads/${threadId}/pins`, { showErrors: false });
  if (response.error) throw new Error(`Failed to list pinned messages: ${response.error.message}`);
  return response.data || [];
}

export async function pinMessage(threadId: string, data: PinMessageRequest): Promise<PinnedMessage> {
  const response = await backendApi.post<PinnedMessage>(`/threads/${threadId}/pins`, data);
  if (response.error) throw new Error(`Failed to pin message: ${response.error.message}`);
  return response.data!;
}

export async function unpinMessage(threadId: string, pinId: string): Promise<void> {
  const response = await backendApi.delete(`/threads/${threadId}/pins/${pinId}`);
  if (response.error) throw new Error(`Failed to unpin message: ${response.error.message}`);
}

export async function updatePin(threadId: string, pinId: string, data: UpdatePinRequest): Promise<PinnedMessage> {
  const response = await backendApi.patch<PinnedMessage>(`/threads/${threadId}/pins/${pinId}`, data);
  if (response.error) throw new Error(`Failed to update pin: ${response.error.message}`);
  return response.data!;
}

export async function getRecentPins(limit = 10): Promise<PinnedMessage[]> {
  const response = await backendApi.get<PinnedMessage[]>(`/pins/recent?limit=${limit}`, { showErrors: false });
  if (response.error) throw new Error(`Failed to get recent pins: ${response.error.message}`);
  return response.data || [];
}
