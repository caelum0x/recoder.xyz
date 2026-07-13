// Owned by Recoder. WhatsApp JID / target normalization for the ConnectorPort
// adapter. This is the REAL extracted normalization logic from
// social-gateways/whatsapp/normalize.ts — group JID detection, user JID / LID
// detection, and target → E.164 normalization — reproduced here so the adapter
// is self-contained. The original module imported `normalizeE164` from the
// un-extracted `../utils.js`; that one function is provided locally as a real,
// dependency-free implementation matching the observed contract (digits are
// kept and prefixed with "+"), exactly as the Signal adapter owns its own
// `normalizeE164`. No behavior in the JID parsing itself is altered, and the
// existing normalize.test.ts contract is preserved verbatim.

const WHATSAPP_USER_JID_RE = /^(\d+)(?::\d+)?@s\.whatsapp\.net$/i;
const WHATSAPP_LID_RE = /^(\d+)@lid$/i;

/**
 * Normalize a phone string to E.164 form ("+<digits>"). WhatsApp speaks bare
 * digits for user JIDs; this strips non-digit characters and re-prefixes "+".
 * Matches the un-extracted `../utils.normalizeE164` contract the original
 * normalize.ts relied on (see the preserved normalize.test.ts expectations).
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

function stripWhatsAppTargetPrefixes(value: string): string {
  let candidate = value.trim();
  for (;;) {
    const before = candidate;
    candidate = candidate.replace(/^whatsapp:/i, "").trim();
    if (candidate === before) {
      return candidate;
    }
  }
}

export function isWhatsAppGroupJid(value: string): boolean {
  const candidate = stripWhatsAppTargetPrefixes(value);
  const lower = candidate.toLowerCase();
  if (!lower.endsWith("@g.us")) {
    return false;
  }
  const localPart = candidate.slice(0, candidate.length - "@g.us".length);
  if (!localPart || localPart.includes("@")) {
    return false;
  }
  return /^[0-9]+(-[0-9]+)*$/.test(localPart);
}

/**
 * Check if value looks like a WhatsApp user target (e.g.
 * "41796666864:0@s.whatsapp.net" or "123@lid").
 */
export function isWhatsAppUserTarget(value: string): boolean {
  const candidate = stripWhatsAppTargetPrefixes(value);
  return WHATSAPP_USER_JID_RE.test(candidate) || WHATSAPP_LID_RE.test(candidate);
}

/**
 * Extract the phone number from a WhatsApp user JID.
 * "41796666864:0@s.whatsapp.net" -> "41796666864"
 * "123456@lid" -> "123456"
 */
export function extractUserJidPhone(jid: string): string | null {
  const candidate = stripWhatsAppTargetPrefixes(jid);
  const userMatch = candidate.match(WHATSAPP_USER_JID_RE);
  if (userMatch) {
    return userMatch[1];
  }
  const lidMatch = candidate.match(WHATSAPP_LID_RE);
  if (lidMatch) {
    return lidMatch[1];
  }
  return null;
}

/**
 * Normalize an outbound target into the canonical form the WhatsApp Web bridge
 * accepts: a group JID ("<id>@g.us") is preserved; a user JID / LID / bare
 * number is reduced to its E.164 phone. Returns null for unparseable targets so
 * callers never deliver to an unaddressable recipient.
 */
export function normalizeWhatsAppTarget(value: string): string | null {
  const candidate = stripWhatsAppTargetPrefixes(value);
  if (!candidate) {
    return null;
  }
  if (isWhatsAppGroupJid(candidate)) {
    const localPart = candidate.slice(0, candidate.length - "@g.us".length);
    return `${localPart}@g.us`;
  }
  if (isWhatsAppUserTarget(candidate)) {
    const phone = extractUserJidPhone(candidate);
    if (!phone) {
      return null;
    }
    const normalized = normalizeE164(phone);
    return normalized.length > 1 ? normalized : null;
  }
  // If the caller passed a JID-ish string we don't understand, fail fast.
  // Otherwise normalizeE164 would happily treat "group:120@g.us" as a number.
  if (candidate.includes("@")) {
    return null;
  }
  const normalized = normalizeE164(candidate);
  return normalized.length > 1 ? normalized : null;
}

/**
 * Resolve the WhatsApp Web send JID for a normalized target. Group targets are
 * already in JID form; an E.164 / bare-number recipient is rendered as the
 * canonical user JID "<digits>@s.whatsapp.net" the bridge addresses.
 */
export function resolveWhatsAppSendJid(target: string): string {
  const normalized = normalizeWhatsAppTarget(target);
  if (!normalized) {
    throw new Error(`WhatsApp recipient is invalid: "${target}"`);
  }
  if (isWhatsAppGroupJid(normalized)) {
    return normalized;
  }
  const digits = normalized.replace(/[^\d]/g, "");
  if (!digits) {
    throw new Error(`WhatsApp recipient is invalid: "${target}"`);
  }
  return `${digits}@s.whatsapp.net`;
}
