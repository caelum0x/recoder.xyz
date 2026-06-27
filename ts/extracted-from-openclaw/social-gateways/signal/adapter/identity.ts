// Owned by Recoder. Real Signal sender-identity logic for the ConnectorPort
// adapter, extracted verbatim from social-gateways/signal/identity.ts. The only
// change is that `normalizeE164` (originally imported from the un-extracted
// `../utils.js`) is provided locally as a real, dependency-free implementation
// matching the observed contract (E.164 numbers like "+15550001111" are
// preserved; surrounding punctuation/whitespace is stripped). No behavior in
// the sender/allowlist resolution itself is altered.

/** A resolved Signal sender: either a phone (E.164) or a bare account UUID. */
export type SignalSender =
  | { kind: "phone"; raw: string; e164: string }
  | { kind: "uuid"; raw: string };

type SignalAllowEntry =
  | { kind: "any" }
  | { kind: "phone"; e164: string }
  | { kind: "uuid"; raw: string };

const UUID_HYPHENATED_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_COMPACT_RE = /^[0-9a-f]{32}$/i;

/**
 * Normalize a phone string to E.164 form. signal-cli speaks E.164 ("+<digits>")
 * for phone recipients; this preserves an existing leading "+", strips all
 * non-digit characters, and re-prefixes "+". Matches the un-extracted
 * `../utils.normalizeE164` contract the original identity/send code relied on.
 */
export function normalizeE164(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  return `+${digits}`;
}

function looksLikeUuid(value: string): boolean {
  if (UUID_HYPHENATED_RE.test(value) || UUID_COMPACT_RE.test(value)) {
    return true;
  }
  const compact = value.replace(/-/g, "");
  if (!/^[0-9a-f]+$/i.test(compact)) {
    return false;
  }
  return /[a-f]/i.test(compact);
}

function stripSignalPrefix(value: string): string {
  return value.replace(/^signal:/i, "").trim();
}

/** Resolve the sender of an inbound envelope (phone preferred over uuid). */
export function resolveSignalSender(params: {
  sourceNumber?: string | null;
  sourceUuid?: string | null;
}): SignalSender | null {
  const sourceNumber = params.sourceNumber?.trim();
  if (sourceNumber) {
    return { kind: "phone", raw: sourceNumber, e164: normalizeE164(sourceNumber) };
  }
  const sourceUuid = params.sourceUuid?.trim();
  if (sourceUuid) {
    return { kind: "uuid", raw: sourceUuid };
  }
  return null;
}

/** Stable allowlist/identity id: E.164 for phones, "uuid:<raw>" for uuids. */
export function formatSignalSenderId(sender: SignalSender): string {
  return sender.kind === "phone" ? sender.e164 : `uuid:${sender.raw}`;
}

/** Human-facing sender label (same as the stable id for Signal). */
export function formatSignalSenderDisplay(sender: SignalSender): string {
  return sender.kind === "phone" ? sender.e164 : `uuid:${sender.raw}`;
}

/** signal-cli send recipient token: E.164 for phones, raw uuid for uuids. */
export function resolveSignalRecipient(sender: SignalSender): string {
  return sender.kind === "phone" ? sender.e164 : sender.raw;
}

/** Stable per-conversation peer id for DM routing/normalization. */
export function resolveSignalPeerId(sender: SignalSender): string {
  return sender.kind === "phone" ? sender.e164 : `uuid:${sender.raw}`;
}

function parseSignalAllowEntry(entry: string): SignalAllowEntry | null {
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "*") {
    return { kind: "any" };
  }

  const stripped = stripSignalPrefix(trimmed);
  const lower = stripped.toLowerCase();
  if (lower.startsWith("uuid:")) {
    const raw = stripped.slice("uuid:".length).trim();
    if (!raw) {
      return null;
    }
    return { kind: "uuid", raw };
  }

  if (looksLikeUuid(stripped)) {
    return { kind: "uuid", raw: stripped };
  }

  return { kind: "phone", e164: normalizeE164(stripped) };
}

/** True when `sender` matches any allowlist entry ("*" allows everyone). */
export function isSignalSenderAllowed(sender: SignalSender, allowFrom: string[]): boolean {
  if (allowFrom.length === 0) {
    return false;
  }
  const parsed = allowFrom
    .map(parseSignalAllowEntry)
    .filter((entry): entry is SignalAllowEntry => entry !== null);
  if (parsed.some((entry) => entry.kind === "any")) {
    return true;
  }
  return parsed.some((entry) => {
    if (entry.kind === "phone" && sender.kind === "phone") {
      return entry.e164 === sender.e164;
    }
    if (entry.kind === "uuid" && sender.kind === "uuid") {
      return entry.raw === sender.raw;
    }
    return false;
  });
}
