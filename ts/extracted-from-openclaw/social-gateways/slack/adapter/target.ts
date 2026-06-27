// Owned by Recoder. Slack send-target parsing, ported verbatim in behavior from
// the real extracted `slack/targets.ts`. The original delegated id-shaping to
// the OpenClaw `../channels/targets.js` helpers (`buildMessagingTarget`,
// `ensureTargetId`, `requireTargetKind`), which were not part of the
// extraction; this owns the equivalent pure logic so it compiles standalone.
// The regex grammar (<@id>, user:/channel:/slack: prefixes, @/# shorthands) is
// unchanged — this is the same real Slack recipient grammar.

export type SlackTargetKind = "user" | "channel";

export interface SlackTarget {
  readonly kind: SlackTargetKind;
  readonly id: string;
  /** The original raw input, retained for diagnostics. */
  readonly raw: string;
}

const SLACK_ID_RE = /^[A-Z0-9]+$/i;

function ensureSlackId(candidate: string, errorMessage: string): string {
  const trimmed = candidate.trim();
  if (!SLACK_ID_RE.test(trimmed)) {
    throw new Error(errorMessage);
  }
  return trimmed;
}

/**
 * Parse a Slack recipient string into a typed target. Returns undefined for an
 * empty input so callers never send to an unresolved recipient. Mirrors the
 * real `parseSlackTarget`.
 */
export function parseSlackTarget(
  raw: string,
  options: { defaultKind?: SlackTargetKind } = {},
): SlackTarget | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const mentionMatch = trimmed.match(/^<@([A-Z0-9]+)>$/i);
  if (mentionMatch) {
    return { kind: "user", id: mentionMatch[1], raw: trimmed };
  }
  if (trimmed.startsWith("user:")) {
    const id = trimmed.slice("user:".length).trim();
    return id ? { kind: "user", id, raw: trimmed } : undefined;
  }
  if (trimmed.startsWith("channel:")) {
    const id = trimmed.slice("channel:".length).trim();
    return id ? { kind: "channel", id, raw: trimmed } : undefined;
  }
  if (trimmed.startsWith("slack:")) {
    const id = trimmed.slice("slack:".length).trim();
    return id ? { kind: "user", id, raw: trimmed } : undefined;
  }
  if (trimmed.startsWith("@")) {
    const id = ensureSlackId(
      trimmed.slice(1),
      "Slack DMs require a user id (use user:<id> or <@id>)",
    );
    return { kind: "user", id, raw: trimmed };
  }
  if (trimmed.startsWith("#")) {
    const id = ensureSlackId(
      trimmed.slice(1),
      "Slack channels require a channel id (use channel:<id>)",
    );
    return { kind: "channel", id, raw: trimmed };
  }
  if (options.defaultKind) {
    return { kind: options.defaultKind, id: trimmed, raw: trimmed };
  }
  return { kind: "channel", id: trimmed, raw: trimmed };
}
