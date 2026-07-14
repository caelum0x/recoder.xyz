// Owned by Recoder. The raw gateway imported `../routing/session-key.js` /
// `../../routing/session-key.js` for the deterministic session-key grammar that
// binds a channel conversation to one agent session. That routing sibling was
// not part of the extraction. The Discord adapter uses `DEFAULT_ACCOUNT_ID`,
// `normalizeAccountId()`, `toAgentRequestSessionKey()`, and
// `resolveThreadSessionKeys()`. Reconstructed here as the real, dependency-free
// grammar shared across channels.

/** The implicit account id used when a channel has a single (unnamed) account. */
export const DEFAULT_ACCOUNT_ID = "default";

/** Prefix every agent-request session key carries (`agent:<id>:...`). */
const AGENT_SESSION_PREFIX = "agent:";

/**
 * Normalize a caller-supplied account id to its canonical form. Trims
 * whitespace and collapses empty / nullish values to {@link DEFAULT_ACCOUNT_ID}
 * so the rest of the routing layer never has to special-case "no account".
 */
export function normalizeAccountId(accountId?: string | null): string {
  const trimmed = accountId?.trim();
  return trimmed ? trimmed : DEFAULT_ACCOUNT_ID;
}

/**
 * Coerce an arbitrary session-store key into a canonical agent-request session
 * key. Keys already in `agent:*` form are returned unchanged; anything else
 * returns `null` so callers can fall back to the raw key.
 */
export function toAgentRequestSessionKey(storeKey: string): string | null {
  const trimmed = storeKey.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith(AGENT_SESSION_PREFIX) ? trimmed : null;
}

export interface ResolveThreadSessionKeysParams {
  /** The session key resolved for the conversation root (channel / DM). */
  baseSessionKey: string;
  /** The thread's own id when the message arrived in a thread, else undefined. */
  threadId?: string | number;
  /** Session key of the thread's parent channel, when known. */
  parentSessionKey?: string;
  /**
   * When true, threads share the parent's key with a `:thread:<id>` suffix;
   * when false, the thread gets its own dedicated session key.
   */
  useSuffix?: boolean;
}

export interface ThreadSessionKeys {
  /** Key the inbound message should be routed under. */
  sessionKey: string;
  /** Key of the conversation root the thread descends from. */
  parentSessionKey: string;
}

/**
 * Resolve the session key an inbound thread message routes to, plus the parent
 * conversation's key. When the message is not in a thread, both collapse to the
 * base key. With `useSuffix`, a thread shares the parent key namespaced by
 * thread id; otherwise the thread becomes its own session.
 */
export function resolveThreadSessionKeys(
  params: ResolveThreadSessionKeysParams,
): ThreadSessionKeys {
  const parentSessionKey = params.parentSessionKey?.trim() || params.baseSessionKey;
  if (params.threadId === undefined || params.threadId === null || params.threadId === "") {
    return { sessionKey: params.baseSessionKey, parentSessionKey };
  }
  const threadId = String(params.threadId);
  if (params.useSuffix) {
    return {
      sessionKey: `${parentSessionKey}:thread:${threadId}`,
      parentSessionKey,
    };
  }
  return {
    sessionKey: `${params.baseSessionKey}:thread:${threadId}`,
    parentSessionKey,
  };
}
