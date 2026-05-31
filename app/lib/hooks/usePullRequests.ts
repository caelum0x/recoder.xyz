/**
 * usePullRequests
 *
 * Data hook for GitHub pull requests treated as first-class artifacts in the
 * dashboard. It consumes the existing docker-backend git routes via the
 * `/api/proxy/git` Next.js proxy:
 *
 *   - POST /api/git/:projectId/pull-request          (open a PR)
 *   - GET  /api/git/:projectId/pull-requests         (list PRs)
 *   - GET  /api/git/:projectId/pull-request/:number  (PR detail w/ reviews+checks)
 *
 * The hook is self-contained: state for list/detail/loading/errors plus action
 * helpers. It never assumes a backend route beyond the three above.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

export type PullRequestState = 'open' | 'closed' | 'merged' | 'all';

export interface PullRequestReview {
  id?: number;
  user?: string;
  state?: string; // APPROVED | CHANGES_REQUESTED | COMMENTED | PENDING | DISMISSED
  submittedAt?: string;
}

export interface PullRequestCheck {
  name?: string;
  status?: string; // queued | in_progress | completed
  conclusion?: string | null; // success | failure | neutral | cancelled | timed_out | action_required
  detailsUrl?: string;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: string; // open | closed
  merged?: boolean;
  draft?: boolean;
  url?: string;
  htmlUrl?: string;
  head?: string;
  base?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PullRequestDetail extends PullRequestSummary {
  body?: string;
  reviews?: PullRequestReview[];
  checks?: PullRequestCheck[];
}

export interface OpenPullRequestInput {
  token: string;
  title: string;
  body?: string;
  head?: string;
  base?: string;
}

interface BackendEnvelope<T> {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
  pullRequest?: T;
  pullRequests?: T;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

async function parseEnvelope<T>(response: Response): Promise<BackendEnvelope<T>> {
  const json = (await response.json().catch(() => null)) as BackendEnvelope<T> | null;
  if (!response.ok) {
    const message = json?.error || json?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  if (json && json.success === false) {
    throw new Error(json.error || json.message || 'Request failed');
  }
  return json ?? {};
}

export interface UsePullRequestsResult {
  pullRequests: PullRequestSummary[];
  detail: PullRequestDetail | null;
  loadingList: boolean;
  loadingDetail: boolean;
  submitting: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setStateFilter: (state: PullRequestState) => void;
  stateFilter: PullRequestState;
  openPullRequest: (input: OpenPullRequestInput) => Promise<PullRequestSummary | null>;
  loadDetail: (token: string, number: number) => Promise<PullRequestDetail | null>;
  clearDetail: () => void;
}

export function usePullRequests(
  projectId: string | null,
  token: string
): UsePullRequestsResult {
  const [pullRequests, setPullRequests] = useState<PullRequestSummary[]>([]);
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<PullRequestState>('open');

  const listPullRequests = useCallback(async () => {
    if (!projectId || !token) {
      setPullRequests([]);
      return;
    }
    setLoadingList(true);
    setError(null);
    try {
      const query = new URLSearchParams({ token, state: stateFilter });
      const response = await fetch(
        `/api/proxy/git/${encodeURIComponent(projectId)}/pull-requests?${query.toString()}`,
        { credentials: 'include' }
      );
      const envelope = await parseEnvelope<PullRequestSummary[]>(response);
      const list =
        (Array.isArray(envelope.data) ? envelope.data : undefined) ||
        (Array.isArray(envelope.pullRequests) ? envelope.pullRequests : undefined) ||
        [];
      setPullRequests(list);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load pull requests'));
      setPullRequests([]);
    } finally {
      setLoadingList(false);
    }
  }, [projectId, token, stateFilter]);

  useEffect(() => {
    void listPullRequests();
  }, [listPullRequests]);

  const openPullRequest = useCallback(
    async (input: OpenPullRequestInput): Promise<PullRequestSummary | null> => {
      if (!projectId) {
        setError('Select a project first');
        return null;
      }
      setSubmitting(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/proxy/git/${encodeURIComponent(projectId)}/pull-request`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          }
        );
        const envelope = await parseEnvelope<PullRequestSummary>(response);
        const created = envelope.data || envelope.pullRequest || null;
        await listPullRequests();
        return created;
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to open pull request'));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [projectId, listPullRequests]
  );

  const loadDetail = useCallback(
    async (detailToken: string, number: number): Promise<PullRequestDetail | null> => {
      if (!projectId) {
        return null;
      }
      setLoadingDetail(true);
      setError(null);
      try {
        const query = new URLSearchParams({ token: detailToken });
        const response = await fetch(
          `/api/proxy/git/${encodeURIComponent(projectId)}/pull-request/${number}?${query.toString()}`,
          { credentials: 'include' }
        );
        const envelope = await parseEnvelope<PullRequestDetail>(response);
        const result = envelope.data || envelope.pullRequest || null;
        setDetail(result);
        return result;
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to load pull request detail'));
        setDetail(null);
        return null;
      } finally {
        setLoadingDetail(false);
      }
    },
    [projectId]
  );

  const clearDetail = useCallback(() => setDetail(null), []);

  return {
    pullRequests,
    detail,
    loadingList,
    loadingDetail,
    submitting,
    error,
    refresh: listPullRequests,
    setStateFilter,
    stateFilter,
    openPullRequest,
    loadDetail,
    clearDetail,
  };
}
