/**
 * Claude Code session-file parser (Omnara technique, Apache-2.0).
 *
 * Claude Code persists each session as JSONL under
 * `~/.claude/projects/<slug>/<session-id>.jsonl`, one JSON event per line. This
 * PURE parser reconstructs the user/agent message stream from that file WITHOUT
 * the Claude SDK — the foundation for palette transcript search and first-run
 * import. It reads the shapes Claude actually writes and degrades on everything
 * else (a malformed line is skipped, never a throw, never a fabricated message).
 *
 * A line looks like: `{ "type": "user"|"assistant"|..., "message": { "role",
 * "content" }, "timestamp": "...", ... }`. `content` is EITHER a plain string OR
 * an array of blocks (`{type:"text",text}`, `{type:"tool_use",name}`,
 * `{type:"tool_result",content}`) — both are flattened to searchable text.
 */

export interface TranscriptMessage {
  readonly role: 'user' | 'assistant' | 'system';
  /** The message flattened to plain text (tool calls rendered as `[tool: name]`). */
  readonly text: string;
  /** ISO timestamp when present on the line; '' otherwise. */
  readonly timestamp: string;
}

function coerceRole(raw: unknown): TranscriptMessage['role'] | null {
  if (raw === 'user' || raw === 'assistant' || raw === 'system') return raw;
  return null;
}

/**
 * Flatten a message `content` (string OR array of blocks) into plain text. Text
 * blocks contribute their text; a tool_use renders as `[tool: <name>]`; a
 * tool_result contributes its inner text (string, or the text blocks of an
 * array). Unknown block shapes contribute nothing. Never throws.
 */
export function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block);
      continue;
    }
    if (block == null || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      parts.push(b.text);
    } else if (b.type === 'tool_use' && typeof b.name === 'string') {
      parts.push(`[tool: ${b.name}]`);
    } else if (b.type === 'tool_result') {
      parts.push(flattenContent(b.content));
    }
  }
  return parts.filter((p) => p !== '').join('\n');
}

/**
 * Parse a Claude session JSONL string into the ordered message stream. Blank and
 * malformed lines are skipped; a line without a user/assistant/system role (a
 * `summary`/meta event) is skipped too — only real turns become messages.
 */
export function parseClaudeSessionJsonl(content: string): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (obj == null || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    const msg = o.message != null && typeof o.message === 'object' ? (o.message as Record<string, unknown>) : null;
    // Role comes from message.role, falling back to the top-level `type`.
    const role = coerceRole(msg?.role) ?? coerceRole(o.type);
    if (role == null) continue;
    const text = flattenContent(msg?.content).trim();
    if (text === '') continue;
    messages.push({
      role,
      text,
      timestamp: typeof o.timestamp === 'string' ? o.timestamp : '',
    });
  }
  return messages;
}

export interface TranscriptMatch {
  readonly role: TranscriptMessage['role'];
  /** A snippet of the matching message, centered on the first hit, bounded. */
  readonly snippet: string;
  readonly timestamp: string;
}

/** Bound each snippet so a huge message can't blow up the search payload. */
const SNIPPET_RADIUS = 80;

function snippetAround(text: string, at: number, query: string): string {
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + query.length + SNIPPET_RADIUS);
  const core = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${core}${end < text.length ? '…' : ''}`;
}

/**
 * Pure case-insensitive substring search over a parsed transcript. Returns one
 * bounded snippet per matching message (first hit), in transcript order. An empty
 * query matches nothing (search is opt-in, never dumps the whole transcript).
 */
export function searchTranscript(messages: readonly TranscriptMessage[], query: string): TranscriptMatch[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const out: TranscriptMatch[] = [];
  for (const m of messages) {
    const at = m.text.toLowerCase().indexOf(q);
    if (at < 0) continue;
    out.push({ role: m.role, snippet: snippetAround(m.text, at, q), timestamp: m.timestamp });
  }
  return out;
}
