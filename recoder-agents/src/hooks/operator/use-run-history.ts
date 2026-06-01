'use client';

import { useQuery } from '@tanstack/react-query';
import { dockerBackendApi } from '@/lib/docker-backend-api';

// ---------------------------------------------------------------------------
// Types
//
// Mirrors the docker-backend control-plane task-lifecycle wire shapes:
//   GET /api/a2a/tasks                  -> { tasks, count, filter }
//   GET /api/a2a/tasks/:taskId/timeline -> TaskTimeline
//
// "Runs" here are A2A task envelopes from the control-plane history — the same
// source PM reads — not the FastAPI thread runs surfaced on /runs.
// ---------------------------------------------------------------------------

export type TaskRunState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | string;

/** A control-plane task envelope, treated as a "run" for operator visibility. */
export interface TaskRun {
  id: string;
  type?: string;
  state: TaskRunState;
  prompt?: string;
  from?: string;
  to?: string;
  result?: string;
  createdAt: string;
  updatedAt: string;
  claimedBy?: string;
  sessionId?: string;
  workspaceId?: string;
  assigneeAgentId?: string;
  metadata?: Record<string, unknown>;
}

interface TaskListResponse {
  tasks: TaskRun[];
  count: number;
  filter: Record<string, unknown>;
}

export type TimelineEventType = 'task' | 'artifact' | 'pr' | 'preview' | 'approval';

export type TimelineEventStatus =
  | 'pending'
  | 'in_progress'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  timestamp: string;
  url?: string;
  status: TimelineEventStatus;
}

export interface TaskTimeline {
  taskId: string;
  workspaceId: string;
  threadId: string;
  traceId: string;
  state: string;
  events: TimelineEvent[];
}

export interface RunHistoryFilter {
  workspaceId?: string;
  state?: TaskRunState;
  assigneeAgentId?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Query-key factory
// ---------------------------------------------------------------------------

const runHistoryKeys = {
  all: ['run-history'] as const,
  list: (filter: RunHistoryFilter) => [...runHistoryKeys.all, 'list', filter] as const,
  timeline: (taskId: string) => [...runHistoryKeys.all, 'timeline', taskId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List recent control-plane runs (A2A task envelopes), newest first.
 */
export function useRunHistory(filter: RunHistoryFilter = {}) {
  return useQuery({
    queryKey: runHistoryKeys.list(filter),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter.workspaceId) params.set('workspace_id', filter.workspaceId);
      if (filter.state) params.set('state', filter.state);
      if (filter.assigneeAgentId) params.set('assignee_agent_id', filter.assigneeAgentId);
      params.set('limit', String(filter.limit ?? 50));
      if (filter.offset) params.set('offset', String(filter.offset));

      const res = await dockerBackendApi.get<TaskListResponse>(`/api/a2a/tasks?${params.toString()}`);
      if (res.success && res.data) {
        const tasks = res.data.tasks ?? [];
        // Newest first by updatedAt (fall back to createdAt).
        return [...tasks].sort((a, b) => {
          const ta = new Date(a.updatedAt || a.createdAt).getTime();
          const tb = new Date(b.updatedAt || b.createdAt).getTime();
          return tb - ta;
        });
      }
      throw new Error(res.error?.message || 'Failed to fetch run history');
    },
    refetchInterval: 5_000,
  });
}

/**
 * Fetch the unified task→artifact→pr→preview→approval timeline for a run.
 */
export function useRunTimeline(taskId: string | null) {
  return useQuery({
    queryKey: runHistoryKeys.timeline(taskId ?? ''),
    queryFn: async () => {
      const res = await dockerBackendApi.get<TaskTimeline>(
        `/api/a2a/tasks/${encodeURIComponent(taskId as string)}/timeline`,
      );
      if (res.success && res.data) return res.data;
      throw new Error(res.error?.message || 'Failed to fetch run timeline');
    },
    enabled: !!taskId,
    refetchInterval: 5_000,
  });
}

export { runHistoryKeys };
