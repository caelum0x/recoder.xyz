/**
 * WorkspaceCenter — the Conductor-style CENTER pane for a selected workspace.
 *
 * This is a real CONVERSATION, not a one-shot command box. It renders an
 * interleaved thread of:
 *   - USER messages: what the operator typed, shown as a bubble the instant they
 *     press Enter (optimistic), keyed by send time.
 *   - AGENT activity: the live + polled RunEvent stream ("what changed"), shown
 *     inline as the agent's reply.
 *
 * Sending a message POSTs to POST /workspaces/:id/message {text}, which starts
 * the next agent run with that text as the prompt. The user bubble is always
 * rendered first; if the backend route 404s (not yet deployed) or otherwise
 * fails, we show a truthful "couldn't send" note on that bubble but never drop
 * it — the operator always sees what they said.
 *
 * The live event stream (api.openStream) stays merged into the polled history,
 * so the agent's reply streams in with low latency. A truthful "What changed"
 * summary (read from the backend's persisted delivery summary in
 * workspace.metadata, never fabricated) and the three Conductor review tabs
 * (All changes / <task> / Review branch changes) sit above the composer.
 */
import { useMemo, useRef, useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { EventLog } from './EventLog';
import { AgentTurn } from './AgentTurn';
import { isLive, statePill, stateTone, messageDisabledReason } from '../lib/workspace-state';
import { workspaceDiffStat } from '../lib/workspace-diffstat';
import { workspaceCodename } from '../lib/workspace-codename';
import { mergeEvents, useLiveStream } from '../lib/event-stream';
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

/**
 * A message the operator typed in this session, rendered optimistically as a
 * bubble. `failed` carries a truthful "couldn't send" note when the backend
 * rejected the send — the bubble is never dropped, so the operator always sees
 * what they said.
 */
interface UserMessage {
  id: string;
  text: string;
  sentAt: number;
  failed?: string;
}

function UserBubble({ message }: { message: UserMessage }) {
  return (
    <div class="ws-msg ws-msg-user">
      <div class="ws-msg-bubble">{message.text}</div>
      {message.failed && (
        <div class="ws-msg-error" title={message.failed}>
          Couldn't send to the agent — {message.failed}
        </div>
      )}
    </div>
  );
}

/**
 * The composer at the bottom of the conversation. Usable only when the backend
 * can actually start the next run (canMessage — awaiting_review /
 * changes_requested / awaiting_approval). For a running, provisioning, or
 * terminal (archived/merged/closed) workspace we show a truthful disabled
 * reason instead of an input that the backend would 400 — the exact bug an
 * archived workspace hit ("workspace has no worktree to continue").
 */
function Composer({
  modelLabel,
  busy,
  onSend,
  state,
}: {
  modelLabel: string;
  busy: boolean;
  onSend: (text: string) => void;
  state: Workspace['state'];
}) {
  const [value, setValue] = useState('');
  const disabledReason = messageDisabledReason(state);

  function submit(e: Event) {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  }

  if (disabledReason) {
    return (
      <div class="ws-cmdbar ws-cmdbar-disabled">
        <span class="ws-cmdbar-disabled-note">{disabledReason}</span>
      </div>
    );
  }

  return (
    <form class="ws-cmdbar" onSubmit={submit}>
      <input
        class="ws-cmdbar-input"
        value={value}
        placeholder="Message the agent — type and press Enter…"
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
          disabled={busy || !value.trim()}
          title="Send to the agent"
          aria-label="Send"
        >
          {busy ? '…' : '↑'}
        </button>
      </div>
    </form>
  );
}

export function WorkspaceCenter({ workspace }: WorkspaceCenterProps) {
  // The operator's typed messages this session, oldest-first. Rendered
  // optimistically so a bubble appears the instant Enter is pressed.
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [sending, setSending] = useState(false);
  const live = isLive(workspace.state);
  const events = usePoll(
    () => api.listEvents(workspace.workspaceId),
    live ? 2000 : 15_000,
    [workspace.workspaceId],
  );
  const streamed = useLiveStream(workspace.workspaceId, live);
  const merged = mergeEvents(events.data, streamed);
  const counts = threadCounts(merged);

  // The model the workspace was actually launched with, if the backend recorded
  // one — shown in the composer chip. Never fabricated: falls back to a label.
  // The real model id the workspace recorded (a variant WITHIN its fixed
  // runtime), if any — sent with each message so the run uses it. Distinct from
  // the display fallback: we never send the runtimeId as a "model".
  const recordedModel =
    workspace.metadata && typeof workspace.metadata === 'object'
      ? (workspace.metadata as Record<string, unknown>).model
      : undefined;
  const modelId = typeof recordedModel === 'string' && recordedModel ? recordedModel : undefined;
  const modelLabel = modelId || workspace.runtimeId || 'agent';

  // Reset the local conversation when switching workspaces — each workspace has
  // its own thread, and the persisted agent activity carries the real history.
  const wsId = workspace.workspaceId;
  const lastWsId = useRef(wsId);
  if (lastWsId.current !== wsId) {
    lastWsId.current = wsId;
    if (messages.length) setMessages([]);
  }

  async function send(text: string): Promise<void> {
    // 1. Render the user's bubble immediately (optimistic) — never lost.
    const msg: UserMessage = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, sentAt: Date.now() };
    setMessages((prev) => [...prev, msg]);
    setSending(true);
    try {
      // 2. POST it to start the next agent run; the reply streams in via events.
      //    Carry the workspace's recorded model so the run uses it (backend
      //    default applies when none was recorded).
      await api.sendMessage(wsId, text, modelId);
    } catch (err) {
      // 3. Truthful failure note on the bubble (e.g. route 404s) — keep the bubble.
      const note = describeError(err);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, failed: note } : m)));
    } finally {
      setSending(false);
    }
    // Refresh the agent activity so the run's first events arrive promptly.
    events.refresh();
  }

  return (
    <section class="ws-center">
      <div class="ws-center-head">
        <span class="ws-center-branch" title={`${workspace.workspaceId} · ${workspace.branch}`}>
          {workspaceCodename(workspace.workspaceId)}
        </span>
        <span class={`ws-row-pill pill-${stateTone(workspace.state)}`}>{statePill(workspace.state)}</span>
        <span class="ws-center-counts">
          {counts.tools} tool call{counts.tools === 1 ? '' : 's'}, {counts.messages} message{counts.messages === 1 ? '' : 's'}
        </span>
        <span class="ws-center-spacer" />
        <span class="ws-center-meta">{live ? 'live (2s)' : 'terminal (15s)'}</span>
      </div>

      <div class="ws-center-scroll">
        <Conversation
          messages={messages}
          events={merged}
          eventsError={events.error}
          eventsLoading={events.loading}
          workspace={workspace}
        />
      </div>

      <Composer
        modelLabel={modelLabel}
        busy={sending}
        onSend={(t) => void send(t)}
        state={workspace.state}
      />
    </section>
  );
}

/**
 * The interleaved conversation thread: USER bubbles and AGENT activity ordered by
 * time. The user's messages (local, optimistic) and the agent's RunEvents (real,
 * streamed + polled) are merged on their timestamps so the thread reads as a true
 * back-and-forth. The "What changed" review summary anchors the bottom.
 */
function Conversation({
  messages,
  events,
  eventsError,
  eventsLoading,
  workspace,
}: {
  messages: UserMessage[];
  events: RunEvent[];
  eventsError: Error | null;
  eventsLoading: boolean;
  workspace: Workspace;
}) {
  // Split the agent event stream around each user message by time, so a message
  // sent mid-run appears between the events that preceded and followed it.
  const segments = useMemo(() => {
    type Segment = { kind: 'user'; message: UserMessage } | { kind: 'agent'; events: RunEvent[] };
    const sorted = [...events].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const result: Segment[] = [];
    let cursor = 0;
    for (const message of messages) {
      const before: RunEvent[] = [];
      while (cursor < sorted.length && new Date(sorted[cursor].createdAt).getTime() <= message.sentAt) {
        before.push(sorted[cursor]);
        cursor += 1;
      }
      if (before.length) result.push({ kind: 'agent', events: before });
      result.push({ kind: 'user', message });
    }
    const rest = sorted.slice(cursor);
    if (rest.length) result.push({ kind: 'agent', events: rest });
    return result;
  }, [messages, events]);

  const empty = messages.length === 0 && events.length === 0;

  return (
    <div class="ws-conversation">
      {empty && !eventsLoading && !eventsError && (
        <div class="ws-conversation-empty">
          Start the conversation — type a message below and the agent will reply here.
        </div>
      )}
      {segments.length === 0 && (eventsLoading || eventsError) && (
        <div class="ws-center-stream">
          <EventLog events={events} error={eventsError} loading={eventsLoading} />
        </div>
      )}
      {segments.map((seg, i) =>
        seg.kind === 'user' ? (
          <UserBubble key={seg.message.id} message={seg.message} />
        ) : (
          <AgentTurn key={`agent-${i}`} events={seg.events} />
        ),
      )}
      <WhatChanged workspace={workspace} />
    </div>
  );
}
