// Owned by Recoder. The @mention routing grammar (interop §7.4
// connectors/routing/mention-router.ts). A gated inbound mention parses into a
// ParsedMention, which the routing seam turns into a TaskEnvelope + a
// coordination-seam delegation request.

/** Intent verbs supported by the mention router grammar. */
export const MENTION_INTENTS = ["handoff", "delegate", "review"] as const;
export type MentionIntent = (typeof MENTION_INTENTS)[number];

/** A parsed `@agent handoff: …` / `delegate:` / `review:` mention. */
export interface ParsedMention {
  readonly intent: MentionIntent;
  /** The @target agent/handle the work is routed to. */
  readonly target: string;
  /** The remaining prompt/body after the intent verb. */
  readonly prompt: string;
}

function isMentionIntent(value: string): value is MentionIntent {
  return (MENTION_INTENTS as readonly string[]).includes(value);
}

/**
 * Parse a gated mention body of the form `@target intent: prompt`.
 * Returns undefined when the body does not match the grammar, so callers never
 * route an un-parseable mention. This is pure and channel-independent.
 */
export function parseMention(body: string): ParsedMention | undefined {
  const trimmed = body.trim();
  const match = /^@(\S+)\s+(handoff|delegate|review)\s*:\s*([\s\S]+)$/i.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const target = match[1];
  const intentRaw = match[2].toLowerCase();
  const prompt = match[3].trim();
  if (!isMentionIntent(intentRaw) || !target || !prompt) {
    return undefined;
  }
  return { intent: intentRaw, target, prompt };
}
