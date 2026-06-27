/**
 * handoff-parser — parse @mention intent from a channel message into a
 * `ParsedHandoffIntent`.
 *
 * MERGED from `parseIntent` + `INTENT_PREFIXES` in
 * `docker-backend/src/a2a/autonomous-routing.service.ts`. Kept PURE: no service
 * lookups, no IO. The original returned a `'message'` sentinel for non-delegation
 * mentions; here we return `null` for that case (the coordination domain has no
 * `'message'` intent — `HANDOFF_INTENTS` is handoff|delegate|review|merge), so a
 * bare mention is "not a handoff" rather than a degenerate handoff.
 */

import {
  HANDOFF_INTENT_PREFIXES,
  type HandoffIntent,
  type ParsedHandoffIntent,
} from '../domain';

/**
 * Parse a channel message + the agents it mentioned into a handoff intent.
 *
 * Mirrors the source algorithm:
 *  1. No mentions → not a handoff (`null`).
 *  2. Take the first mentioned agent as the target.
 *  3. Strip the `@target` prefix, then match an intent prefix
 *     (`handoff:` / `delegate:` / `review:` / `merge:`, case-insensitive).
 *  4. A mention with no intent prefix is a plain message → `null` (no delegation).
 */
export function parseHandoffIntent(
  text: string,
  mentionedAgentIds: ReadonlyArray<string>,
): ParsedHandoffIntent | null {
  if (mentionedAgentIds.length === 0) {
    return null;
  }

  const targetAgentId = mentionedAgentIds[0];

  // Strip the leading "@target" so the intent prefix (if any) sits at the start.
  const mentionPattern = new RegExp(`@${escapeRegExp(targetAgentId)}\\s*`, 'i');
  const afterMention = text.replace(mentionPattern, '').trim();
  const lowered = afterMention.toLowerCase();

  for (const [prefix, intent] of Object.entries(HANDOFF_INTENT_PREFIXES)) {
    if (lowered.startsWith(prefix)) {
      return {
        intent: intent as HandoffIntent,
        targetAgentId,
        prompt: afterMention.slice(prefix.length).trim(),
      };
    }
  }

  // A mention with no intent prefix is a regular message, not a handoff.
  return null;
}

/** Escape regex metacharacters so an agent id can be matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
