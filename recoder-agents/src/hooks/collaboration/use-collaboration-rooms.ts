'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
  listMessages,
  sendMessage,
  getRoomSummary,
  type CreateRoomRequest,
  type UpdateRoomRequest,
  type SendMessageRequest,
} from '@/lib/api/collaboration-rooms';
import { toast } from '@/lib/toast';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const collaborationKeys = {
  all: ['collaboration-rooms'] as const,
  rooms: (status?: string) => [...collaborationKeys.all, 'list', status] as const,
  room: (roomId: string) => [...collaborationKeys.all, 'detail', roomId] as const,
  messages: (roomId: string) => [...collaborationKeys.all, 'messages', roomId] as const,
  summary: (roomId: string) => [...collaborationKeys.all, 'summary', roomId] as const,
} as const;

// ---------------------------------------------------------------------------
// Room Hooks
// ---------------------------------------------------------------------------

export function useCollaborationRooms(status?: string) {
  return useQuery({
    queryKey: collaborationKeys.rooms(status),
    queryFn: () => listRooms({ status: status && status !== 'all' ? status : undefined }),
    staleTime: 30_000,
  });
}

export function useRoom(roomId: string) {
  return useQuery({
    queryKey: collaborationKeys.room(roomId),
    queryFn: () => getRoom(roomId),
    enabled: !!roomId,
    staleTime: 15_000,
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoomRequest) => createRoom(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collaborationKeys.all });
      toast.success('Room created');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create room');
    },
  });
}

export function useUpdateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: UpdateRoomRequest }) =>
      updateRoom(roomId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: collaborationKeys.all });
      queryClient.invalidateQueries({ queryKey: collaborationKeys.room(variables.roomId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update room');
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) => deleteRoom(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collaborationKeys.all });
      toast.success('Room deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete room');
    },
  });
}

// ---------------------------------------------------------------------------
// Message Hooks
// ---------------------------------------------------------------------------

export function useRoomMessages(roomId: string) {
  return useQuery({
    queryKey: collaborationKeys.messages(roomId),
    queryFn: () => listMessages(roomId, { limit: 100 }),
    enabled: !!roomId,
    refetchInterval: 5000,
    staleTime: 3_000,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: SendMessageRequest }) =>
      sendMessage(roomId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: collaborationKeys.messages(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: collaborationKeys.summary(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: collaborationKeys.rooms() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send message');
    },
  });
}

// ---------------------------------------------------------------------------
// Summary Hook
// ---------------------------------------------------------------------------

export function useRoomSummary(roomId: string) {
  return useQuery({
    queryKey: collaborationKeys.summary(roomId),
    queryFn: () => getRoomSummary(roomId),
    enabled: !!roomId,
    staleTime: 15_000,
  });
}
