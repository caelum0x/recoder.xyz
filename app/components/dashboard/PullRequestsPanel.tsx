/**
 * PullRequestsPanel
 *
 * Presentational panel for GitHub pull requests as first-class artifacts.
 * Renders an "open PR" form plus a list of PRs with state / checks / reviews
 * badges, and an expandable detail view. All data flows through the
 * usePullRequests hook; this component owns only local form/UI state.
 */

'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  GitMerge,
  GitPullRequest,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  usePullRequests,
  type PullRequestCheck,
  type PullRequestReview,
  type PullRequestState,
  type PullRequestSummary,
} from '@/lib/hooks/usePullRequests';

interface PullRequestsPanelProps {
  projectId: string | null;
  projectLabel?: string;
}

const STATE_FILTERS: { value: PullRequestState; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

function prStateBadge(pr: PullRequestSummary): { label: string; className: string; Icon: typeof GitPullRequest } {
  if (pr.merged) {
    return { label: 'Merged', className: 'bg-purple-500/20 text-purple-300', Icon: GitMerge };
  }
  if (pr.state === 'open') {
    return {
      label: pr.draft ? 'Draft' : 'Open',
      className: pr.draft ? 'bg-slate-500/20 text-slate-300' : 'bg-green-500/20 text-green-300',
      Icon: GitPullRequest,
    };
  }
  return { label: 'Closed', className: 'bg-red-500/20 text-red-300', Icon: XCircle };
}

function checkSummary(checks: PullRequestCheck[] | undefined): {
  passed: number;
  failed: number;
  pending: number;
  total: number;
} {
  const list = checks ?? [];
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const check of list) {
    const conclusion = (check.conclusion || '').toLowerCase();
    const status = (check.status || '').toLowerCase();
    if (status && status !== 'completed') {
      pending += 1;
    } else if (conclusion === 'success') {
      passed += 1;
    } else if (['failure', 'timed_out', 'cancelled', 'action_required'].includes(conclusion)) {
      failed += 1;
    } else {
      pending += 1;
    }
  }
  return { passed, failed, pending, total: list.length };
}

function reviewSummary(reviews: PullRequestReview[] | undefined): {
  approved: number;
  changesRequested: number;
  total: number;
} {
  const list = reviews ?? [];
  let approved = 0;
  let changesRequested = 0;
  for (const review of list) {
    const state = (review.state || '').toUpperCase();
    if (state === 'APPROVED') approved += 1;
    else if (state === 'CHANGES_REQUESTED') changesRequested += 1;
  }
  return { approved, changesRequested, total: list.length };
}

function ChecksBadge({ checks }: { checks: PullRequestCheck[] | undefined }) {
  const summary = checkSummary(checks);
  if (summary.total === 0) {
    return <span className="text-xs text-gray-500">No checks</span>;
  }
  if (summary.failed > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-300">
        <XCircle className="h-3.5 w-3.5" />
        {summary.failed} failing
      </span>
    );
  }
  if (summary.pending > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-300">
        <CircleDot className="h-3.5 w-3.5" />
        {summary.pending} pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-300">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {summary.passed} passing
    </span>
  );
}

function ReviewsBadge({ reviews }: { reviews: PullRequestReview[] | undefined }) {
  const summary = reviewSummary(reviews);
  if (summary.changesRequested > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-orange-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        {summary.changesRequested} changes requested
      </span>
    );
  }
  if (summary.approved > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {summary.approved} approved
      </span>
    );
  }
  return <span className="text-xs text-gray-500">No reviews</span>;
}

export function PullRequestsPanel({ projectId, projectLabel }: PullRequestsPanelProps) {
  const [token, setToken] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [head, setHead] = useState('');
  const [base, setBase] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    pullRequests,
    detail,
    loadingList,
    loadingDetail,
    submitting,
    error,
    refresh,
    setStateFilter,
    stateFilter,
    openPullRequest,
    loadDetail,
    clearDetail,
  } = usePullRequests(projectId, token);

  const canSubmit = useMemo(
    () => Boolean(projectId) && token.trim().length > 0 && title.trim().length > 0 && !submitting,
    [projectId, token, title, submitting]
  );

  const handleOpenPr = async () => {
    setNotice(null);
    const created = await openPullRequest({
      token: token.trim(),
      title: title.trim(),
      body: body.trim() || undefined,
      head: head.trim() || undefined,
      base: base.trim() || undefined,
    });
    if (created) {
      setNotice(`Opened PR #${created.number}`);
      setTitle('');
      setBody('');
      setHead('');
      setBase('');
      setShowForm(false);
    }
  };

  const toggleDetail = async (pr: PullRequestSummary) => {
    if (expanded === pr.number) {
      setExpanded(null);
      clearDetail();
      return;
    }
    setExpanded(pr.number);
    if (token.trim()) {
      await loadDetail(token.trim(), pr.number);
    }
  };

  if (!projectId) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-6 text-center text-gray-400">
        Select a project to view its pull requests.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header / controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white">
          <GitPullRequest className="h-5 w-5 text-purple-400" />
          <h2 className="text-lg font-semibold">Pull Requests</h2>
          {projectLabel ? <span className="text-sm text-gray-500">· {projectLabel}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-700/50 bg-slate-900/50 p-0.5">
            {STATE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setStateFilter(filter.value)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  stateFilter === filter.value
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loadingList}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingList ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs text-purple-200 hover:bg-purple-500/30"
          >
            <GitPullRequest className="h-3.5 w-3.5" />
            Open PR
          </button>
        </div>
      </div>

      {/* GitHub token */}
      <div>
        <label className="mb-1 block text-xs text-gray-400">GitHub token</label>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="ghp_… (used to authenticate with GitHub)"
          className="w-full rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-purple-500/50 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-600">
          Required to list and open pull requests. The token is sent only with these requests.
        </p>
      </div>

      {/* Open PR form */}
      {showForm ? (
        <div className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-800/50 p-4">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add feature X"
              className="w-full rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-purple-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Description</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              placeholder="Optional description"
              className="w-full rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-purple-500/50 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-400">Head branch</label>
              <input
                type="text"
                value={head}
                onChange={(event) => setHead(event.target.value)}
                placeholder="feature-branch (defaults to current)"
                className="w-full rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-purple-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Base branch</label>
              <input
                type="text"
                value={base}
                onChange={(event) => setBase(event.target.value)}
                placeholder="main (defaults to default branch)"
                className="w-full rounded-lg border border-slate-700/50 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-purple-500/50 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleOpenPr()}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/20 px-4 py-2 text-sm text-purple-200 hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitPullRequest className="h-4 w-4" />}
              Open pull request
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Notices */}
      {notice ? (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-300">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {/* PR list */}
      {loadingList ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : pullRequests.length === 0 ? (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-8 text-center text-gray-400">
          {token.trim() ? 'No pull requests found.' : 'Enter a GitHub token to load pull requests.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {pullRequests.map((pr) => {
            const badge = prStateBadge(pr);
            const isExpanded = expanded === pr.number;
            return (
              <li
                key={pr.number}
                className="rounded-lg border border-slate-700/50 bg-slate-800/50 overflow-hidden"
              >
                <button
                  onClick={() => void toggleDetail(pr)}
                  className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-800"
                >
                  <span className="mt-0.5 text-gray-500">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        <badge.Icon className="h-3 w-3" />
                        {badge.label}
                      </span>
                      <span className="font-medium text-white truncate">{pr.title}</span>
                      <span className="text-xs text-gray-500">#{pr.number}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {pr.head && pr.base ? (
                        <span className="text-xs text-gray-500">
                          {pr.head} → {pr.base}
                        </span>
                      ) : null}
                      {pr.author ? (
                        <span className="text-xs text-gray-500">by {pr.author}</span>
                      ) : null}
                    </div>
                  </div>
                  {pr.htmlUrl || pr.url ? (
                    <a
                      href={pr.htmlUrl || pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="text-xs text-purple-300 hover:text-purple-200"
                    >
                      View ↗
                    </a>
                  ) : null}
                </button>

                {isExpanded ? (
                  <div className="border-t border-slate-700/50 bg-slate-900/40 p-4">
                    {loadingDetail ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading details…
                      </div>
                    ) : detail && detail.number === pr.number ? (
                      <div className="space-y-3">
                        {detail.body ? (
                          <p className="whitespace-pre-wrap text-sm text-gray-300">{detail.body}</p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-4">
                          <ChecksBadge checks={detail.checks} />
                          <ReviewsBadge reviews={detail.reviews} />
                        </div>
                        {detail.reviews && detail.reviews.length > 0 ? (
                          <div>
                            <p className="mb-1 text-xs font-medium text-gray-400">Reviews</p>
                            <ul className="space-y-1">
                              {detail.reviews.map((review, index) => (
                                <li
                                  key={review.id ?? index}
                                  className="flex items-center justify-between text-xs text-gray-400"
                                >
                                  <span>{review.user || 'Unknown'}</span>
                                  <span>{review.state || '—'}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {detail.checks && detail.checks.length > 0 ? (
                          <div>
                            <p className="mb-1 text-xs font-medium text-gray-400">Checks</p>
                            <ul className="space-y-1">
                              {detail.checks.map((check, index) => (
                                <li
                                  key={`${check.name ?? 'check'}-${index}`}
                                  className="flex items-center justify-between text-xs text-gray-400"
                                >
                                  <span className="truncate">{check.name || 'Check'}</span>
                                  <span>{check.conclusion || check.status || '—'}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No additional details available.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default PullRequestsPanel;
