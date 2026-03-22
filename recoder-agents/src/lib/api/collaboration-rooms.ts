import { backendApi } from '@/lib/api-client';

// ============================================================================
// Types
// ============================================================================

export interface CollaborationRoom {
  id: string;
  user_id: string;
  room_name: string;
  /** @deprecated alias for room_name — kept for backward compat with old UI */
  name?: string;
  description: string | null;
  agent_ids: string[];
  /** v2 values: active|paused|completed|archived. Legacy: resolved (maps to completed) */
  status: 'active' | 'paused' | 'completed' | 'archived' | 'resolved';
  objective: string | null;
  /** @deprecated room_type not in v2 schema */
  room_type?: string;
  created_at: string;
  updated_at: string;
}

export interface CollaborationMessage {
  id: string;
  room_id: string;
  user_id: string;
  agent_id: string | null;
  sender_type: 'user' | 'agent' | 'system';
  /** @deprecated legacy field: sender name from old schema */
  sender_name?: string | null;
  content: string;
  message_type: 'text' | 'task_assignment' | 'status_update' | 'result' | 'handoff' | 'code' | 'suggestion' | 'decision' | 'action_item';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CollaborationTask {
  id: string;
  room_id: string;
  user_id: string;
  assigned_agent_id: string | null;
  task_title: string;
  task_description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  result: Record<string, unknown>;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CreateRoomData {
  room_name?: string;
  /** @deprecated Use room_name. Kept for backward compat with old UI. */
  name?: string;
  description?: string;
  /** @deprecated room_type not in v2 schema */
  room_type?: string;
  agent_ids?: string[];
  objective?: string;
}

export interface UpdateRoomData {
  room_name?: string;
  description?: string;
  agent_ids?: string[];
  status?: 'active' | 'paused' | 'completed' | 'archived' | string;
  objective?: string;
}

export interface PostMessageData {
  content: string;
  agent_id?: string;
  sender_type?: 'user' | 'agent' | 'system' | string;
  message_type?: 'text' | 'task_assignment' | 'status_update' | 'result' | 'handoff' | 'code' | 'suggestion' | 'decision' | 'action_item' | string;
  metadata?: Record<string, unknown>;
}

export interface CreateTaskData {
  task_title: string;
  task_description?: string;
  assigned_agent_id?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_at?: string;
}

export interface UpdateTaskData {
  task_title?: string;
  task_description?: string;
  assigned_agent_id?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  result?: Record<string, unknown>;
  due_at?: string;
}

// ============================================================================
// Room API
// ============================================================================

export const createRoom = async (data: CreateRoomData): Promise<CollaborationRoom> => {
  const response = await backendApi.post<CollaborationRoom>('/collaboration/rooms', data);
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listRooms = async (params?: {
  status?: string;
  limit?: number;
}): Promise<CollaborationRoom[]> => {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  const url = `/collaboration/rooms${qs.toString() ? `?${qs}` : ''}`;
  const response = await backendApi.get<CollaborationRoom[]>(url, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getRoom = async (roomId: string): Promise<CollaborationRoom> => {
  const response = await backendApi.get<CollaborationRoom>(`/collaboration/rooms/${roomId}`, {
    showErrors: true,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateRoom = async (
  roomId: string,
  data: UpdateRoomData
): Promise<CollaborationRoom> => {
  const response = await backendApi.patch<CollaborationRoom>(
    `/collaboration/rooms/${roomId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const deleteRoom = async (roomId: string): Promise<{ deleted: boolean; room_id: string }> => {
  const response = await backendApi.delete<{ deleted: boolean; room_id: string }>(
    `/collaboration/rooms/${roomId}`
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

// ============================================================================
// Message API
// ============================================================================

export const postMessage = async (
  roomId: string,
  data: PostMessageData
): Promise<CollaborationMessage> => {
  const response = await backendApi.post<CollaborationMessage>(
    `/collaboration/rooms/${roomId}/messages`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listMessages = async (
  roomId: string,
  params?: { limit?: number; offset?: number }
): Promise<CollaborationMessage[]> => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const url = `/collaboration/rooms/${roomId}/messages${qs.toString() ? `?${qs}` : ''}`;
  const response = await backendApi.get<CollaborationMessage[]>(url, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

// ============================================================================
// Task API
// ============================================================================

export const createTask = async (
  roomId: string,
  data: CreateTaskData
): Promise<CollaborationTask> => {
  const response = await backendApi.post<CollaborationTask>(
    `/collaboration/rooms/${roomId}/tasks`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const updateTask = async (
  roomId: string,
  taskId: string,
  data: UpdateTaskData
): Promise<CollaborationTask> => {
  const response = await backendApi.patch<CollaborationTask>(
    `/collaboration/rooms/${roomId}/tasks/${taskId}`,
    data
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const listTasks = async (
  roomId: string,
  params?: { status?: string; limit?: number }
): Promise<CollaborationTask[]> => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  const url = `/collaboration/rooms/${roomId}/tasks${qs.toString() ? `?${qs}` : ''}`;
  const response = await backendApi.get<CollaborationTask[]>(url, { showErrors: true });
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

// ============================================================================
// Backward-compatibility aliases (Sprint 66 schema update)
// The old hooks file references these names.
// ============================================================================

/** @deprecated Use postMessage instead */
export const sendMessage = postMessage;

/** @deprecated getRoomSummary is not available in the v2 schema */
export interface RoomSummary {
  room_id: string;
  message_count: number;
  unique_participants: number;
  action_items_count: number;
  last_activity: string | null;
}
export const getRoomSummary = async (_roomId: string): Promise<RoomSummary | null> => null;

/** @deprecated Use CreateRoomData instead */
export type CreateRoomRequest = CreateRoomData;

/** @deprecated Use UpdateRoomData instead */
export type UpdateRoomRequest = UpdateRoomData;

/** @deprecated Use PostMessageData instead */
export type SendMessageRequest = PostMessageData;
