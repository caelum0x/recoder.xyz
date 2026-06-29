/**
 * WorkspaceCenter — the Conductor-style CENTER pane for a selected workspace.
 *
 * Composes the live agent event stream (GET /workspaces/:id/events, polled) with
 * a truthful "What changed" summary (read from the backend's persisted delivery
 * summary in workspace.metadata, never fabricated) and a steer input at the
 * bottom that drives the live tmux session via POST /sessions/:id/keys.
 *
 * The steer input is only enabled when the workspace actually has an attached
 * tmux session AND is still live; otherwise it is disabled with a truthful note
 * explaining why — we never imply we can steer an agent that isn't running.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RunEvent as ConductorRunEvent } from '@recoder/conductor-ui';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { EventLog } from './EventLog';
import { isLive, stateLabel, stateTone } from '../lib/workspace-state';
import { workspaceDiffStat } from '../lib/workspace-diffstat';
import type { RunEvent, Workspace } from '../types';

interface WorkspaceCenterProps {
  workspace: Workspace;
}

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/** Read the human-readable delivery summary lines the backend persisted, if any. */
function deliverySummaryText(workspace: Workspace): string | null {
  const meta = workspace.metadata;
  if (!meta || typeof meta !== 'object') return null;
  const delivery = (meta as Record<string, unknown>).delivery;
  if (!delivery || typeof delivery !== 'object') return null;
  const stat = (delivery as Record<string, unknown>).diffStat;
  return typeof stat === 'string' && stat.trim() ? stat.trim() : null;
}

function WhatChanged({ workspace }: { workspace: Workspace }) {
  const stat = workspaceDiffStat(workspace);
  const summaryText = deliverySummaryText(workspace);

  if (!stat && !summaryText) {
    return (
      <div class="ws-summary ws-summary-empty">
        No reviewable changes yet — this updates once the agent produces work.
      </div>
    );
  }

  return (
    <div class="ws-summary">
      <div class="ws-summary-head">
        <span class="ws-summary-title">What changed</span>
        {stat && (
          <span class="ws-diffstat">
            <span class="ws-summary-files">{stat.changedFiles} file{stat.changedFiles === 1 ? '' : 's'}</span>
            {stat.additions !== null && <span class="ws-diffstat-add">+{stat.additions}</span>}
            {stat.deletions !== null && <span class="ws-diffstat-del">-{stat.deletions}</span>}
          </span>
        )}
      </div>
      {summaryText && <pre class="ws-summary-stat">{summaryText}</pre>}
    </div>
  );
}

function SteerInput({ workspace }: { workspace: Workspace }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = isLive(workspace.state);
  const hasSession = Boolean(workspace.sessionName);
  const canSteer = live && hasSession;

  const reason = !hasSession
    ? 'No tmux session attached to this workspace yet.'
    : !live
      ? `Workspace is ${stateLabel(workspace.state)} — the agent is no longer running.`
      : '';

  async function send(e: Event) {
    e.preventDefault();
    const text = value.trim();
    if (!text || !canSteer) return;
    setError(null);
    setBusy(true);
    try {
      // The session id the conductor exposes for a workspace is the workspaceId;
      // POST /sessions/:id/keys forwards keystrokes to the live tmux pane (the
      // backend appends Enter), so this steers the real running agent.
      await api.sessionKeys(workspace.workspaceId, text);
      setValue('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="ws-steer" onSubmit={send}>
      <input
        class="ws-steer-input"
        value={value}
        disabled={!canSteer || busy}
        placeholder={
          canSteer
            ? 'Steer the agent — type a message and press Enter…'
            : reason
        }
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
      />
      <button class="btn btn-primary btn-sm" type="submit" disabled={!canSteer || busy || !value.trim()}>
        {busy ? 'Sending…' : 'Send'}
      </button>
      {error && <span class="ws-steer-error">{error}</span>}
    </form>
  );
}

/**
 * Subscribe to the LIVE conductor event stream for a workspace via the shared
 * `@recoder/conductor-ui` ConductorClient (`api.openStream`). It upgrades to the
 * conductor WS endpoint when available and falls back to polling captured pane
 * output, surfacing lower-latency agent activity than the base `listEvents` poll.
 *
 * Returns the events streamed since mount (most-recent last). The hook is inert
 * for non-live workspaces (nothing to stream once the agent has stopped).
 */
function useLiveStream(workspaceId: string, live: boolean): RunEvent[] {
  const [streamed, setStreamed] = useState<RunEvent[]>([]);
  // Cap retained streamed events so a long-running agent does not grow unbounded.
  const MAX_STREAMED = 200;
  const idRef = useRef(workspaceId);
  idRef.current = workspaceId;

  useEffect(() => {
    if (!live) {
      setStreamed([]);
      return;
    }
    setStreamed([]);
    const handle = api.openStream(workspaceId, (event: ConductorRunEvent) => {
      // The package RunEvent is shape-compatible with the cockpit RunEvent
      // (both mirror packages/agent-os event.ts), so this is a true reuse.
      setStreamed((prev) => {
        const next = [...prev, event as RunEvent];
        return next.length > MAX_STREAMED ? next.slice(next.length - MAX_STREAMED) : next;
      });
    });
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, live]);

  return streamed;
}

/** Merge polled history with live-streamed events, de-duped by eventId, oldest-first. */
function mergeEvents(polled: RunEvent[] | null, streamed: RunEvent[]): RunEvent[] {
  const byId = new Map<string, RunEvent>();
  for (const ev of polled ?? []) byId.set(ev.eventId, ev);
  for (const ev of streamed) byId.set(ev.eventId, ev);
  return [...byId.values()];
}

export function WorkspaceCenter({ workspace }: WorkspaceCenterProps) {
  const live = isLive(workspace.state);
  const events = usePoll(
    () => api.listEvents(workspace.workspaceId),
    live ? 2000 : 15_000,
    [workspace.workspaceId],
  );
  const streamed = useLiveStream(workspace.workspaceId, live);
  const merged = mergeEvents(events.data, streamed);

  return (
    <section class="ws-center">
      <div class="ws-center-head">
        <span class={`badge tone-${stateTone(workspace.state)}`}>{stateLabel(workspace.state)}</span>
        <span class="ws-center-branch" title={workspace.branch}>{workspace.branch}</span>
        <span class="ws-center-meta">
          {workspace.runtimeId} · {workspace.substrate} · {live ? 'live (2s)' : 'terminal (15s)'}
        </span>
      </div>

      <WhatChanged workspace={workspace} />

      <div class="ws-center-stream">
        <div class="ws-center-stream-label">Agent activity</div>
        <EventLog events={merged} error={events.error} loading={events.loading} />
      </div>

      <SteerInput workspace={workspace} />
    </section>
  );
}
