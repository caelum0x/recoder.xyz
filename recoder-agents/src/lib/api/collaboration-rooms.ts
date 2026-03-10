import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ============================================================================
// Types
// ============================================================================

export interface CollaborationRoom {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  room_type: 'discussion' | 'review' | 'debugging' | 'planning';
  agent_ids: string[];
  status: 'active' | 'archived' | 'resolved';
  created_at: string;
  updated_at: string;
  recent_messages?: CollaborationMessage[];
}

export interface CollaborationMessage {
  id: string;
  room_id: string;
  user_id: string;
  sender_type: 'user' | 'agent' | 'system';
  sender_name: string | null;
  agent_id: string | null;
  content: string;
  message_type: 'text' | 'code' | 'suggestion' | 'decision' | 'action_item';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateRoomRequest {
  name: string;
  description?: string;
  room_type?: string;
  agent_ids?: string[];
}

export interface UpdateRoomRequest {
  name?: string;
  description?: string;
  status?: string;
  agent_ids?: string[];
}

export interface SendMessageRequest {
  content: string;
  message_type?: string;
  agent_id?: string;
  sender_name?: string;
}

export interface RoomSummary {
  room_id: string;
  message_count: number;
  unique_participants: number;
  action_items_count: number;
  last_activity: string | null;
}

// ============================================================================
// Room API
// ============================================================================

export async function createRoom(data: CreateRoomRequest): Promise<CollaborationRoom> {
  const response = await backendApi.post<CollaborationRoom>('/collaboration/rooms', data, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'create collaboration room' });
    throw new Error(response.error.message || 'Failed to create room');
  }

  return response.data as CollaborationRoom;
}

export async function listRooms(params?: {
  status?: string;
  limit?: number;
}): Promise<CollaborationRoom[]> {
  const searchParams = new URLSearchParams();
  if (params?.status && params.status !== 'all') searchParams.append('status', params.status);
  if (params?.limit) searchParams.append('limit', String(params.limit));

  const query = searchParams.toString();
  const url = query ? `/collaboration/rooms?${query}` : '/collaboration/rooms';

  const response = await backendApi.get<CollaborationRoom[]>(url, { showErrors: false });

  if (response.error) {
    handleApiError(response.error, { operation: 'list collaboration rooms' });
    throw new Error(response.error.message || 'Failed to list rooms');
  }

  return response.data as CollaborationRoom[];
}

export async function getRoom(roomId: string): Promise<CollaborationRoom> {
  const response = await backendApi.get<CollaborationRoom>(
    `/collaboration/rooms/${roomId}`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'get collaboration room' });
    throw new Error(response.error.message || 'Failed to get room');
  }

  return response.data as CollaborationRoom;
}

export async function updateRoom(
  roomId: string,
  data: UpdateRoomRequest
): Promise<CollaborationRoom> {
  const response = await backendApi.patch<CollaborationRoom>(
    `/collaboration/rooms/${roomId}`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'update collaboration room' });
    throw new Error(response.error.message || 'Failed to update room');
  }

  return response.data as CollaborationRoom;
}

export async function deleteRoom(roomId: string): Promise<{ deleted: boolean; room_id: string }> {
  const response = await backendApi.delete<{ deleted: boolean; room_id: string }>(
    `/collaboration/rooms/${roomId}`,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'delete collaboration room' });
    throw new Error(response.error.message || 'Failed to delete room');
  }

  return response.data as { deleted: boolean; room_id: string };
}

// ============================================================================
// Message API
// ============================================================================

export async function sendMessage(
  roomId: string,
  data: SendMessageRequest
): Promise<CollaborationMessage> {
  const response = await backendApi.post<CollaborationMessage>(
    `/collaboration/rooms/${roomId}/messages`,
    data,
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'send collaboration message' });
    throw new Error(response.error.message || 'Failed to send message');
  }

  return response.data as CollaborationMessage;
}

export async function listMessages(
  roomId: string,
  params?: { limit?: number; offset?: number }
): Promise<CollaborationMessage[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.append('limit', String(params.limit));
  if (params?.offset) searchParams.append('offset', String(params.offset));

  const query = searchParams.toString();
  const url = query
    ? `/collaboration/rooms/${roomId}/messages?${query}`
    : `/collaboration/rooms/${roomId}/messages`;

  const response = await backendApi.get<CollaborationMessage[]>(url, {
    showErrors: false,
    cache: 'no-store',
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'list collaboration messages' });
    throw new Error(response.error.message || 'Failed to list messages');
  }

  return response.data as CollaborationMessage[];
}

export async function getRoomSummary(roomId: string): Promise<RoomSummary> {
  const response = await backendApi.get<RoomSummary>(
    `/collaboration/rooms/${roomId}/summary`,
    { showErrors: false, cache: 'no-store' }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'get room summary' });
    throw new Error(response.error.message || 'Failed to get room summary');
  }

  return response.data as RoomSummary;
}
