/**
 * acp-session-update — maps an ACP `session/update` notification to a concise,
 * STRUCTURED transcript marker. The streaming chunk variants (user/agent message,
 * agent thought) are raw text that already flows into `capture()` verbatim; this
 * module surfaces the DISCRETE structured events a scraped PTY can't express —
 * tool-call lifecycle (`tool_call` / `tool_call_update`) and plan updates
 * (`plan`) — as one-line summaries the substrate appends to the SAME capture
 * buffer, so they ride the existing run-tailer (which already carries the run
 * context) with no new emission channel, workspace lookup, or per-token cost.
 *
 * Pure + degrade-truthful: any unknown/malformed shape returns `null` (skipped,
 * never a throw); only the variants worth a marker produce one.
 *
 * ACP schema (agentclientprotocol.com): `SessionUpdate` is discriminated by
 * `update.sessionUpdate`; `tool_call`/`tool_call_update` carry `title`/`kind`/
 * `status`/`toolCallId`, and `plan` carries `entries: PlanEntry[]`.
 */

/** A structured event distilled from a `session/update` notification. */
export type AcpStructuredUpdate =
  | {
      readonly type: 'tool_call';
      readonly toolCallId?: string;
      readonly title?: string;
      readonly kind?: string;
      readonly status?: string;
    }
  | {
      readonly type: 'plan';
      readonly entries: ReadonlyArray<{
        readonly content: string;
        readonly status?: string;
        readonly priority?: string;
      }>;
    };

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** A defined, non-empty string, else undefined. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/**
 * Distill a `session/update` notification's params into a structured marker, or
 * `null` for the streaming-text + metadata variants (which are not surfaced here).
 */
export function mapSessionUpdate(params: unknown): AcpStructuredUpdate | null {
  if (!isObj(params)) return null;
  const update = params.update;
  if (!isObj(update)) return null;

  switch (update.sessionUpdate) {
    case 'tool_call':
    case 'tool_call_update': {
      const marker: AcpStructuredUpdate = {
        type: 'tool_call',
        ...(str(update.toolCallId)
          ? { toolCallId: str(update.toolCallId) }
          : {}),
        ...(str(update.title) ? { title: str(update.title) } : {}),
        ...(str(update.kind) ? { kind: str(update.kind) } : {}),
        ...(str(update.status) ? { status: str(update.status) } : {}),
      };
      return marker;
    }
    case 'plan': {
      const entries = (Array.isArray(update.entries) ? update.entries : [])
        .filter(isObj)
        .map(e => ({
          content: String(e.content ?? ''),
          ...(str(e.status) ? { status: str(e.status) } : {}),
          ...(str(e.priority) ? { priority: str(e.priority) } : {}),
        }));
      return { type: 'plan', entries };
    }
    default:
      // user/agent_message_chunk, agent_thought_chunk (→ capture text) and the
      // *_update metadata variants are intentionally not surfaced as markers.
      return null;
  }
}

/** A one-line human-readable summary of a structured update (for the transcript). */
export function summarizeStructuredUpdate(update: AcpStructuredUpdate): string {
  if (update.type === 'plan') {
    const total = update.entries.length;
    const done = update.entries.filter(e => e.status === 'completed').length;
    const active = update.entries.find(
      e => e.status === 'in_progress'
    )?.content;
    const head = `plan: ${done}/${total} done`;
    return active ? `${head} — now: ${active}` : head;
  }
  const parts = [
    update.title ?? 'tool call',
    update.kind ? `[${update.kind}]` : '',
    update.status ? `— ${update.status}` : '',
  ].filter(p => p !== '');
  return `tool: ${parts.join(' ')}`;
}

/**
 * The transcript line the substrate appends for a structured update, or `''` when
 * there is nothing structured to surface (so the caller appends nothing).
 */
export function structuredUpdateLine(params: unknown): string {
  const update = mapSessionUpdate(params);
  return update ? `\n[acp ${summarizeStructuredUpdate(update)}]` : '';
}
