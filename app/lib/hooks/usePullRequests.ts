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

// Debounce window for the token-driven auto-fetch so typing/pasting a PAT does
// not trigger one list request per keystroke.
const TOKEN_DEBOUNCE_MS = 600;

export type PullRequestState = 'open' | 'closed' | 'all';

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
  // Some legacy backend shapes place these at the envelope root rather than
  // inside `data`; kept optional so we can fall back gracefully.
  pullRequest?: unknown;
  pullRequests?: unknown;
}

// docker-backend list route returns { pullRequests: [...], repo: {...} } in `data`.
interface PullRequestListData {
  pullRequests?: PullRequestSummary[];
  repo?: unknown;
}

// docker-backend detail route returns { pullRequest, reviews, checks } in `data`.
interface PullRequestDetailData {
  pullRequest?: PullRequestSummary;
  reviews?: PullRequestReview[];
  checks?: PullRequestCheck[];
}

// docker-backend open route returns { pullRequest: {...} } in `data`.
interface PullRequestOpenData {
  pullRequest?: PullRequestSummary;
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

  // Debounce the token so the auto-fetch effect does not fire on every
  // keystroke while a user pastes/types a PAT (HIGH review issue).
  const [debouncedToken, setDebouncedToken] = useState(token);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedToken(token), TOKEN_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [token]);

  const listPullRequests = useCallback(async () => {
    if (!projectId || !debouncedToken) {
      setPullRequests([]);
      return;
    }
    setLoadingList(true);
    setError(null);
    try {
      // Token is sent via header (not URL query) so the PAT never appears in a
      // browser-visible URL or proxy access logs. The proxy forwards it to the
      // backend as a server-side `?token=` query param.
      const query = new URLSearchParams({ state: stateFilter });
      const response = await fetch(
        `/api/proxy/git/${encodeURIComponent(projectId)}/pull-requests?${query.toString()}`,
        { credentials: 'include', headers: { 'x-github-token': debouncedToken } }
      );
      const envelope = await parseEnvelope<PullRequestListData>(response);
      const data = envelope.data;
      const list =
        data?.pullRequests ??
        (Array.isArray(data) ? (data as PullRequestSummary[]) : undefined) ??
        (Array.isArray(envelope.pullRequests)
          ? (envelope.pullRequests as PullRequestSummary[])
          : undefined) ??
        [];
      setPullRequests(list);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load pull requests'));
      setPullRequests([]);
    } finally {
      setLoadingList(false);
    }
  }, [projectId, debouncedToken, stateFilter]);

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
        // Token sent via header (not body/URL) so the PAT never appears in a
        // browser-visible URL; the proxy forwards it to the backend as ?token=.
        const { token: prToken, ...prBody } = input;
        const response = await fetch(
          `/api/proxy/git/${encodeURIComponent(projectId)}/pull-request`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'x-github-token': prToken,
            },
            body: JSON.stringify(prBody),
          }
        );
        const envelope = await parseEnvelope<PullRequestOpenData>(response);
        const created =
          envelope.data?.pullRequest ??
          (envelope.pullRequest as PullRequestSummary | undefined) ??
          null;
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
        // Token sent via header (not URL query) to keep the PAT out of URLs/logs.
        const response = await fetch(
          `/api/proxy/git/${encodeURIComponent(projectId)}/pull-request/${number}`,
          { credentials: 'include', headers: { 'x-github-token': detailToken } }
        );
        const envelope = await parseEnvelope<PullRequestDetailData>(response);
        const pr =
          envelope.data?.pullRequest ??
          (envelope.pullRequest as PullRequestSummary | undefined);
        const result: PullRequestDetail | null = pr
          ? {
              ...pr,
              reviews: envelope.data?.reviews ?? [],
              checks: envelope.data?.checks ?? [],
            }
          : null;
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
