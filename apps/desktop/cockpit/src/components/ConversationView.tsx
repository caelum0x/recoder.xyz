/**
 * ConversationView — the FRIENDLY skin of the workspace detail surface toggle.
 *
 * This is the "not scary" half of the Recoder Terminal vision
 * (docs/architecture/RECODER-TERMINAL-VISION.md): the SAME conductor session the
 * full RecoderTerminal attaches a PTY to, shown instead as a calm, chat-like
 * conversation. It reads the exact same RunEvent stream
 * (`mergeEvents(listEvents, openStream)`) the center pane uses — never a second
 * source of truth, never a fake TTY.
 *
 * Friendly principles applied here:
 *   - Plain-language status ("Working…", "Agent finished", "Waiting for
 *     approval"), derived from the real workspace state — never tmux/pty internals.
 *   - Raw run output is COLLAPSED by default behind a "Show output" affordance;
 *     terminal-averse users never see scary logs unless they ask.
 *   - The composer writes via `sendMessage` (starts a run with a prompt) — the
 *     SAME write semantics as the center conversation, NOT raw tmux keystrokes.
 *     Raw keystrokes belong only to the full terminal; the two are never crossed.
 *   - Muted, Cursor-style chrome reusing existing tokens — no vibrant noise.
 */
import { useRef, useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { EventLog, friendlyAgentText } from './EventLog';
import type { RunEventType } from '../types';
import { isLive, messageDisabledReason } from '../lib/workspace-state';
import { mergeEvents, useLiveStream } from '../lib/event-stream';
import type { RunEvent, Workspace, WorkspaceState } from '../types';

interface ConversationViewProps {
  workspace: Workspace;
}

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

type StatusTone = 'live' | 'wait' | 'done' | 'bad';
interface FriendlyStatus {
  label: string;
  tone: StatusTone;
}

/**
 * A plain-language status for the friendly view, derived from the REAL workspace
 * state. We never surface tmux/pty internals here — just calm copy an operator
 * who never wants to see a terminal can trust. Every state maps to a short,
 * human, one-line label drawn from the canonical "not scary" vocabulary
 * ("Working…", "Thinking…", "Waiting for you", "Reviewing", "Done", "Stopped").
 */
function friendlyStatus(state: WorkspaceState): FriendlyStatus {
  switch (state) {
    case 'created':
    case 'setting_up':
      return { label: 'Setting up…', tone: 'wait' };
    case 'ready':
      return { label: 'Ready', tone: 'wait' };
    case 'running':
      return { label: 'Working…', tone: 'live' };
    case 'awaiting_approval':
      return { label: 'Waiting for you', tone: 'wait' };
    case 'awaiting_review':
      return { label: 'Reviewing', tone: 'wait' };
    case 'changes_requested':
      return { label: 'Waiting for you', tone: 'wait' };
    case 'merging':
      return { label: 'Merging…', tone: 'live' };
    case 'merged':
      return { label: 'Done', tone: 'done' };
    case 'failed':
      return { label: 'Stopped', tone: 'bad' };
    case 'cancelled':
      return { label: 'Stopped', tone: 'bad' };
    case 'archived':
      return { label: 'Archived', tone: 'done' };
    default:
      return { label: 'Idle', tone: 'wait' };
  }
}

/**
 * Refine the state-derived status with the freshest live RunEvent so the calm
 * label tracks what the agent is actually doing moment-to-moment — still only
 * plain-language words, never raw event types. While the workspace is broadly
 * `running` the event tells us the finer feeling:
 *   - waiting on the operator   → "Waiting for you"
 *   - a fresh start, no output yet → "Thinking…"
 *   - a verification pass        → "Reviewing"
 * For non-live states the truthful state label always wins (a `log` event must
 * never make a merged/stopped workspace look like it is "Working…").
 */
function refineStatusFromEvents(base: FriendlyStatus, latestType: RunEventType | null): FriendlyStatus {
  if (!latestType) return base;
  // Only refine while the workspace is genuinely in-flight.
  if (base.tone !== 'live') return base;
  switch (latestType) {
    case 'needs_input':
    case 'approval_requested':
      return { label: 'Waiting for you', tone: 'wait' };
    case 'started':
      return { label: 'Thinking…', tone: 'live' };
    case 'verified':
      return { label: 'Reviewing', tone: 'live' };
    default:
      return base;
  }
}

/** The freshest event's type (for status refinement), or null when none. */
function latestEventType(events: RunEvent[]): RunEventType | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const t = events[i]?.type;
    if (t) return t;
  }
  return null;
}

/**
 * The single newest line of friendly agent text, for the calm one-line "latest"
 * summary above the collapsed output. Reuses `friendlyAgentText` so the scary
 * tmux "Pane is dead" banner never leaks into the friendly summary.
 */
function latestLine(events: RunEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    const raw =
      ev.message ?? (ev.data && typeof ev.data.output === 'string' ? (ev.data.output as string) : '');
    if (!raw) continue;
    const friendly = friendlyAgentText(raw).trim();
    if (friendly) {
      // Keep it to one calm line — the full text lives in the collapsible output.
      const firstLine = friendly.split('\n').find((l) => l.trim()) ?? friendly;
      return firstLine.trim();
    }
  }
  return null;
}

/** A message the operator typed this session, rendered optimistically. */
interface UserMessage {
  id: string;
  text: string;
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
 * The friendly composer. Same write semantics as the center conversation —
 * `sendMessage` starts the next agent run with the typed text as a prompt. This
 * is deliberately NOT the raw `tmux send-keys` path the full terminal uses.
 */
function Composer({
  busy,
  onSend,
  state,
}: {
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

export function ConversationView({ workspace }: ConversationViewProps) {
  const live = isLive(workspace.state);
  const events = usePoll(
    () => api.listEvents(workspace.workspaceId),
    live ? 2000 : 15_000,
    [workspace.workspaceId],
  );
  const streamed = useLiveStream(workspace.workspaceId, live);
  const merged = mergeEvents(events.data, streamed);

  // Raw output is hidden by default — terminal-averse users live in the calm
  // summary and never see scary logs unless they ask. Reset per workspace.
  const [showOutput, setShowOutput] = useState(false);
  const wsId = workspace.workspaceId;
  const lastWsId = useRef(wsId);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [sending, setSending] = useState(false);
  if (lastWsId.current !== wsId) {
    lastWsId.current = wsId;
    if (messages.length) setMessages([]);
    if (showOutput) setShowOutput(false);
  }

  const status = refineStatusFromEvents(friendlyStatus(workspace.state), latestEventType(merged));
  const latest = latestLine(merged);

  async function send(text: string): Promise<void> {
    // Optimistic bubble first — never lost, even if the send fails.
    const msg: UserMessage = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text };
    setMessages((prev) => [...prev, msg]);
    setSending(true);
    try {
      await api.sendMessage(wsId, text);
    } catch (err) {
      const note = describeError(err);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, failed: note } : m)));
    } finally {
      setSending(false);
    }
    events.refresh();
  }

  return (
    <section class="conv">
      <div class="conv-scroll">
        {/* Calm, plain-language status card — the heart of "not scary". */}
        <div class="conv-status">
          <span class={`conv-status-dot conv-status-${status.tone}`} aria-hidden="true" />
          <span class="conv-status-label">{status.label}</span>
          {latest && <span class="conv-status-latest" title={latest}>{latest}</span>}
        </div>

        {messages.map((m) => (
          <UserBubble key={m.id} message={m} />
        ))}

        {/* Raw run output, collapsed by default. EventLog is the SAME friendly
            skin engine the center pane uses; we just gate it behind a toggle. */}
        <div class="conv-output">
          <button
            class="conv-output-toggle"
            onClick={() => setShowOutput((v) => !v)}
            aria-expanded={showOutput}
          >
            <span class="conv-output-chevron" aria-hidden="true">{showOutput ? '▾' : '▸'}</span>
            {showOutput ? 'Hide output' : 'Show output'}
          </button>
          {showOutput && (
            <div class="conv-output-body">
              <EventLog events={merged} error={events.error} loading={events.loading} />
            </div>
          )}
        </div>
      </div>

      <Composer busy={sending} onSend={(t) => void send(t)} state={workspace.state} />
    </section>
  );
}
