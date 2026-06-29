/**
 * WorkspaceCenter — the Conductor-style CENTER pane for a selected workspace.
 *
 * Composes the live agent event stream (GET /workspaces/:id/events, polled) with
 * a truthful "What changed" summary (read from the backend's persisted delivery
 * summary in workspace.metadata, never fabricated) and a command bar at the
 * bottom that drives the live tmux session via POST /sessions/:id/keys.
 *
 * The thread header shows a truthful tool-call / message count derived from the
 * real RunEvent stream, the three Conductor tabs (All changes / <task> / Review
 * branch changes), and a command bar carrying a model chip, "Link issue", and
 * the send button. The command bar input is only enabled when the workspace
 * actually has an attached tmux session AND is still live; otherwise it is
 * disabled with a truthful note — we never imply we can steer a stopped agent.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RunEvent as ConductorRunEvent } from '@recoder/conductor-ui';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { EventLog } from './EventLog';
import { isLive, stateLabel, statePill, stateTone } from '../lib/workspace-state';
import { workspaceDiffStat } from '../lib/workspace-diffstat';
import type { RunEvent, Workspace } from '../types';

interface WorkspaceCenterProps {
  workspace: Workspace;
}

type CenterTab = 'all' | 'task' | 'review';

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

/**
 * Truthful tool-call / message counts over the real RunEvent stream. We count
 * `artifact` events as tool calls (the agent produced a tool result/artifact)
 * and `log` events as messages — both are real backend event types, never
 * invented. Returns null counts when there are no events yet.
 */
function threadCounts(events: RunEvent[] | null): { tools: number; messages: number } {
  if (!events) return { tools: 0, messages: 0 };
  let tools = 0;
  let messages = 0;
  for (const ev of events) {
    if (ev.type === 'artifact') tools += 1;
    else if (ev.type === 'log') messages += 1;
  }
  return { tools, messages };
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
        <span class="ws-summary-title">Summary</span>
        {stat && (
          <span class="ws-diffstat">
            <span class="ws-summary-files">{stat.changedFiles} file{stat.changedFiles === 1 ? '' : 's'}</span>
            {stat.additions !== null && <span class="ws-diffstat-add">+{stat.additions}</span>}
            {stat.deletions !== null && <span class="ws-diffstat-del">-{stat.deletions}</span>}
          </span>
        )}
      </div>
      <div class="ws-summary-subhead">What changed</div>
      {summaryText && <pre class="ws-summary-stat">{summaryText}</pre>}
    </div>
  );
}

function CommandBar({ workspace }: { workspace: Workspace }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = isLive(workspace.state);
  const hasSession = Boolean(workspace.sessionName);
  const canSteer = live && hasSession;

  // The model the workspace was actually launched with, if the backend recorded
  // one — shown in the chip. Never fabricated: falls back to a generic label.
  const model =
    (workspace.metadata && typeof workspace.metadata === 'object'
      ? (workspace.metadata as Record<string, unknown>).model
      : undefined) || workspace.runtimeId;
  const modelLabel = typeof model === 'string' && model ? model : 'agent';

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
    <form class="ws-cmdbar" onSubmit={send}>
      <input
        class="ws-cmdbar-input"
        value={value}
        disabled={!canSteer || busy}
        placeholder={
          canSteer
            ? 'Steer the agent — type a message and press Enter…'
            : reason
        }
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
      />
      <div class="ws-cmdbar-row">
        <span class="ws-cmdbar-chip" title="Model this workspace runs">
          <span class="ws-cmdbar-chip-dot" aria-hidden="true" />
          {modelLabel}
        </span>
        <span class="ws-cmdbar-link" title="Link an issue to this workspace">
          <span class="ws-cmdbar-link-icon" aria-hidden="true">#</span>
          Link issue
        </span>
        <span class="ws-cmdbar-spacer" />
        <button
          class="ws-cmdbar-send"
          type="submit"
          disabled={!canSteer || busy || !value.trim()}
          title={canSteer ? 'Send to the agent' : reason}
          aria-label="Send"
        >
          {busy ? '…' : '↑'}
        </button>
      </div>
      {error && <span class="ws-cmdbar-error">{error}</span>}
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
  const [tab, setTab] = useState<CenterTab>('all');
  const live = isLive(workspace.state);
  const events = usePoll(
    () => api.listEvents(workspace.workspaceId),
    live ? 2000 : 15_000,
    [workspace.workspaceId],
  );
  const streamed = useLiveStream(workspace.workspaceId, live);
  const merged = mergeEvents(events.data, streamed);
  const counts = threadCounts(merged);

  return (
    <section class="ws-center">
      <div class="ws-center-head">
        <span class="ws-center-branch" title={workspace.branch}>{workspace.branch}</span>
        <span class={`ws-row-pill pill-${stateTone(workspace.state)}`}>{statePill(workspace.state)}</span>
        <span class="ws-center-counts">
          {counts.tools} tool call{counts.tools === 1 ? '' : 's'}, {counts.messages} message{counts.messages === 1 ? '' : 's'}
        </span>
        <span class="ws-center-spacer" />
        <span class="ws-center-meta">{live ? 'live (2s)' : 'terminal (15s)'}</span>
      </div>

      <div class="ws-center-tabs">
        <button class={tab === 'all' ? 'ws-ctab ws-ctab-active' : 'ws-ctab'} onClick={() => setTab('all')}>
          All changes
        </button>
        <button
          class={tab === 'task' ? 'ws-ctab ws-ctab-active' : 'ws-ctab'}
          onClick={() => setTab('task')}
          title={workspace.taskId}
        >
          {workspace.branch}
        </button>
        <button class={tab === 'review' ? 'ws-ctab ws-ctab-active' : 'ws-ctab'} onClick={() => setTab('review')}>
          Review branch changes
        </button>
      </div>

      <div class="ws-center-scroll">
        {tab === 'review' ? (
          <WhatChanged workspace={workspace} />
        ) : (
          <>
            <div class="ws-center-stream">
              <EventLog events={merged} error={events.error} loading={events.loading} />
            </div>
            <WhatChanged workspace={workspace} />
          </>
        )}
      </div>

      <CommandBar workspace={workspace} />
    </section>
  );
}
