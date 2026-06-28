/**
 * MemoryCandidatesPanel — the reviewed-memory-candidate lifecycle surface.
 *
 * Durable memory is never written directly: agents propose *candidates* with
 * evidence (taskId + artifactId), and a candidate is materialized into a durable
 * MemoryItem only on an explicit accepted review. This panel:
 *   - lists candidates from GET /api/agent-os/memory/lifecycle/candidates (~8s),
 *   - shows each candidate's evidence + status,
 *   - offers accept/reject only while a candidate is still pending, calling
 *     POST .../:id/review and reflecting the REAL result (including the
 *     materialized memoryId on accept),
 *   - has a propose form (POST .../candidates) requiring evidence.
 *
 * No mock data: an empty backlog renders a truthful empty state, and a fetch
 * failure surfaces the real error instead of fabricating candidates.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError, UnauthorizedError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import {
  MEMORY_SCOPES,
  candidateStatusLabel,
  candidateStatusTone,
  hasEvidence,
  isCandidatePending,
} from '../lib/agent-os-state';
import type { MemoryCandidate, MemoryScope, ReviewMemoryResult } from '../types';

const POLL_MS = 8000;
const REVIEWER = 'cockpit-operator';

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof UnauthorizedError) return `Unauthorized (${err.status}): ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

interface ProposeFormProps {
  onProposed: () => void;
  onClose: () => void;
}

function ProposeForm({ onProposed, onClose }: ProposeFormProps) {
  const [scope, setScope] = useState<MemoryScope>('repo');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [taskId, setTaskId] = useState('');
  const [artifactId, setArtifactId] = useState('');
  const [proposedBy, setProposedBy] = useState('cockpit-operator');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    title.trim() && body.trim() && taskId.trim() && artifactId.trim() && proposedBy.trim();

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.proposeMemoryCandidate({
        scope,
        title: title.trim(),
        body: body.trim(),
        evidence: { taskId: taskId.trim(), artifactId: artifactId.trim() },
        proposedBy: proposedBy.trim(),
      });
      onProposed();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="memory-propose" onSubmit={submit}>
      <div class="field-row">
        <div class="field">
          <span>Scope</span>
          <select value={scope} onChange={(e) => setScope((e.target as HTMLSelectElement).value as MemoryScope)}>
            {MEMORY_SCOPES.map((s) => (
              <option value={s} key={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <span>Proposed by</span>
          <input value={proposedBy} onInput={(e) => setProposedBy((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      <div class="field">
        <span>Title</span>
        <input value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} placeholder="What should be remembered" />
      </div>
      <div class="field">
        <span>Body</span>
        <textarea rows={3} value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} placeholder="The durable lesson / fact, with context" />
      </div>
      <div class="field-row">
        <div class="field">
          <span>Evidence · taskId</span>
          <input value={taskId} onInput={(e) => setTaskId((e.target as HTMLInputElement).value)} placeholder="task-123" />
        </div>
        <div class="field">
          <span>Evidence · artifactId</span>
          <input value={artifactId} onInput={(e) => setArtifactId((e.target as HTMLInputElement).value)} placeholder="artifact-abc" />
        </div>
      </div>
      {error && <p class="form-error">{error}</p>}
      <div class="modal-actions">
        <button class="btn btn-sm btn-ghost" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button class="btn btn-sm btn-primary" type="submit" disabled={!valid || busy}>
          {busy ? 'Proposing…' : 'Propose candidate'}
        </button>
      </div>
    </form>
  );
}

interface CandidateRowProps {
  candidate: MemoryCandidate;
  onReviewed: (result: ReviewMemoryResult) => void;
}

function CandidateRow({ candidate, onReviewed }: CandidateRowProps) {
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = isCandidatePending(candidate.status);

  async function review(accepted: boolean) {
    setBusy(accepted ? 'accept' : 'reject');
    setError(null);
    try {
      const result = await api.reviewMemoryCandidate(candidate.candidateId, {
        accepted,
        reviewedBy: REVIEWER,
      });
      onReviewed(result);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div class="memory-row">
      <div class="memory-row-head">
        <span class={`badge tone-${candidateStatusTone(candidate.status)}`}>
          {candidateStatusLabel(candidate.status)}
        </span>
        <span class="memory-scope">{candidate.scope}</span>
        <span class="memory-title">{candidate.title}</span>
      </div>
      <p class="memory-body">{candidate.body}</p>
      <div class="memory-evidence">
        {hasEvidence(candidate) ? (
          <span class="memory-evidence-ok" title="Evidence present">
            evidence: task {candidate.evidence.taskId} · artifact {candidate.evidence.artifactId}
          </span>
        ) : (
          <span class="memory-evidence-missing">missing evidence</span>
        )}
        <span class="memory-proposed">proposed by {candidate.proposedBy}</span>
      </div>
      {candidate.reviewedBy && (
        <p class="memory-reviewed">
          reviewed by {candidate.reviewedBy}
          {candidate.reviewReason ? `: ${candidate.reviewReason}` : ''}
        </p>
      )}
      {error && <p class="action-error">{error}</p>}
      {pending && (
        <div class="memory-row-actions">
          <button
            class="btn btn-sm btn-primary"
            type="button"
            disabled={busy !== null}
            onClick={() => void review(true)}
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept'}
          </button>
          <button
            class="btn btn-sm btn-danger"
            type="button"
            disabled={busy !== null}
            onClick={() => void review(false)}
          >
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  );
}

export function MemoryCandidatesPanel() {
  const candidates = usePoll(() => api.listMemoryCandidates(), POLL_MS);
  const [showPropose, setShowPropose] = useState(false);
  const [lastResult, setLastResult] = useState<ReviewMemoryResult | null>(null);

  const list = candidates.data || [];
  const unreachable = candidates.error instanceof BackendUnreachableError;

  return (
    <section class="memory-panel">
      <div class="panel-head">
        <h2 class="panel-title">Memory Candidates</h2>
        <div class="panel-head-actions">
          <button class="btn btn-ghost btn-sm" onClick={() => candidates.refresh()} disabled={candidates.loading}>
            {candidates.loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button class="btn btn-sm btn-primary" onClick={() => setShowPropose((v) => !v)}>
            {showPropose ? 'Close' : 'Propose'}
          </button>
        </div>
      </div>

      {unreachable && (
        <div class="banner banner-error">
          <strong>Backend unreachable.</strong> Cannot list memory candidates.
        </div>
      )}
      {candidates.error && !unreachable && (
        <p class="action-error">Memory candidates error: {candidates.error.message}</p>
      )}

      {lastResult && (
        <div class="banner banner-warn">
          {lastResult.memory ? (
            <span>
              <strong>Accepted.</strong> Durable memory materialized:{' '}
              <code>{lastResult.memory.memoryId}</code> (status {lastResult.memory.status}).
            </span>
          ) : (
            <span>
              <strong>Rejected.</strong> Candidate <code>{lastResult.candidate.candidateId}</code>{' '}
              left as {candidateStatusLabel(lastResult.candidate.status)} — no durable memory written.
            </span>
          )}
        </div>
      )}

      {showPropose && (
        <ProposeForm
          onProposed={() => {
            setShowPropose(false);
            candidates.refresh();
          }}
          onClose={() => setShowPropose(false)}
        />
      )}

      <div class="memory-list">
        {candidates.loading && !candidates.data ? (
          <div class="panel-empty">Loading memory candidates…</div>
        ) : list.length === 0 && !candidates.error ? (
          <div class="panel-empty">
            <p>No memory candidates.</p>
            <p class="panel-empty-sub">
              Durable memory is only ever materialized through an accepted review. Propose a
              candidate with evidence (taskId + artifactId) to start the lifecycle.
            </p>
          </div>
        ) : (
          list.map((candidate) => (
            <CandidateRow
              candidate={candidate}
              key={candidate.candidateId}
              onReviewed={(result) => {
                setLastResult(result);
                candidates.refresh();
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}
