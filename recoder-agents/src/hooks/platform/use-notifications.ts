'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationsResponse,
} from '@/lib/api/platform-notifications';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const notificationKeys = {
  all: ['platform-notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
} as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch platform notifications, polling every 30 seconds. */
export function useNotifications(options?: { enabled?: boolean }) {
  return useQuery<NotificationsResponse>({
    queryKey: notificationKeys.list(),
    queryFn: getNotifications,
    refetchInterval: 30_000,
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled !== false,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Mark a single notification as read, then refresh the list. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
  });
}

/** Mark all notifications as read, then refresh the list. */
export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      // Optimistically update the cache to zero unread
      await queryClient.cancelQueries({ queryKey: notificationKeys.list() });
      const previous = queryClient.getQueryData<NotificationsResponse>(notificationKeys.list());

      if (previous) {
        queryClient.setQueryData<NotificationsResponse>(notificationKeys.list(), {
          ...previous,
          unreadCount: 0,
          notifications: previous.notifications.map((n) => ({ ...n, read: true })),
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      // Roll back on failure
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    },
  });
}
