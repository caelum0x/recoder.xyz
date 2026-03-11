import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createRoom,
  listRooms,
  getRoom,
  updateRoom,
  deleteRoom,
  postMessage,
  listMessages,
  createTask,
  updateTask,
  listTasks,
  type CreateRoomData,
  type UpdateRoomData,
  type PostMessageData,
  type CreateTaskData,
  type UpdateTaskData,
} from '@/lib/api/collaboration-rooms';

// ============================================================================
// Room Hooks
// ============================================================================

export function useCollaborationRooms(status?: string) {
  return useQuery({
    queryKey: ['collaboration-rooms', status],
    queryFn: () => listRooms({ status }),
    staleTime: 30_000,
  });
}

export function useRoomDetail(roomId: string) {
  return useQuery({
    queryKey: ['collaboration-room', roomId],
    queryFn: () => getRoom(roomId),
    enabled: !!roomId,
    staleTime: 20_000,
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRoomData) => createRoom(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collaboration-rooms'] });
    },
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: UpdateRoomData }) =>
      updateRoom(roomId, data),
    onSuccess: (_data, { roomId }) => {
      qc.invalidateQueries({ queryKey: ['collaboration-rooms'] });
      qc.invalidateQueries({ queryKey: ['collaboration-room', roomId] });
    },
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) => deleteRoom(roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collaboration-rooms'] });
    },
  });
}

// ============================================================================
// Message Hooks
// ============================================================================

export function useRoomMessages(roomId: string, options?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['collaboration-messages', roomId, options],
    queryFn: () => listMessages(roomId, options),
    enabled: !!roomId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function usePostMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: PostMessageData }) =>
      postMessage(roomId, data),
    onSuccess: (_data, { roomId }) => {
      qc.invalidateQueries({ queryKey: ['collaboration-messages', roomId] });
      qc.invalidateQueries({ queryKey: ['collaboration-room', roomId] });
    },
  });
}

// ============================================================================
// Task Hooks
// ============================================================================

export function useRoomTasks(roomId: string, status?: string) {
  return useQuery({
    queryKey: ['collaboration-tasks', roomId, status],
    queryFn: () => listTasks(roomId, { status }),
    enabled: !!roomId,
    staleTime: 20_000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: CreateTaskData }) =>
      createTask(roomId, data),
    onSuccess: (_data, { roomId }) => {
      qc.invalidateQueries({ queryKey: ['collaboration-tasks', roomId] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      roomId,
      taskId,
      data,
    }: {
      roomId: string;
      taskId: string;
      data: UpdateTaskData;
    }) => updateTask(roomId, taskId, data),
    onSuccess: (_data, { roomId }) => {
      qc.invalidateQueries({ queryKey: ['collaboration-tasks', roomId] });
    },
  });
}
