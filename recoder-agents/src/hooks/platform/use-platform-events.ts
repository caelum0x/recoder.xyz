'use client';

import { useMutation } from '@tanstack/react-query';
import { emitPlatformEvent, type PlatformEvent } from '@/lib/api/platform-events';

// ---------------------------------------------------------------------------
// Core mutation
// ---------------------------------------------------------------------------

/** Generic mutation for emitting any platform event. */
export function useEmitEvent() {
  return useMutation<void, Error, PlatformEvent>({
    mutationFn: (event) => emitPlatformEvent(event),
    onError: (error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[platform-events] Failed to emit event:', error.message);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Emit an `agent.thread.created` event. */
export function useEmitThreadCreated() {
  const { mutate, ...rest } = useEmitEvent();

  const emit = (
    threadId: string,
    threadName: string,
    userId: string,
  ) => {
    mutate({
      type: 'agent.thread.created',
      userId,
      title: 'New Thread Created',
      message: `Thread "${threadName}" was created.`,
      sourceApp: 'agents',
      actionUrl: `/threads/${threadId}`,
      channels: ['in_app'],
    });
  };

  return { emit, ...rest };
}

/** Emit an `agent.task.completed` event. */
export function useEmitTaskCompleted() {
  const { mutate, ...rest } = useEmitEvent();

  const emit = (
    threadId: string,
    threadName: string,
    userId: string,
  ) => {
    mutate({
      type: 'agent.task.completed',
      userId,
      title: 'Task Completed',
      message: `Task in thread "${threadName}" has completed.`,
      sourceApp: 'agents',
      actionUrl: `/threads/${threadId}`,
      channels: ['in_app', 'email'],
    });
  };

  return { emit, ...rest };
}
