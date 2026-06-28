// Owned by Recoder. The default `GatePolicy`: derive the pure `GateInput` the
// trust boundary consumes directly from a `NormalizedInboundMessage` plus a
// small, explicit deployment policy. This is the missing glue that makes the
// per-channel adapters live end-to-end — without it, every integrator would
// hand-roll the mapping from a normalized message to gate input, which is
// exactly the place a subtle "accidentally authorize everyone" bug hides.
//
// Hostile-by-default: the allowlist is matched against the channel-reported
// sender identity fields, an empty allowlist authorizes NOTHING (you must opt a
// principal in), and control-command detection is a literal prefix scan of the
// already-normalized text. The decision itself stays in `resolveGate`; this only
// builds its inputs.

import type { NormalizedInboundMessage } from "../connector/inbound-message.js";
import type { SenderIdentity } from "../connector/sender-identity.js";
import type { ChatType } from "../connector/chat-type.js";
import type { GateInput } from "../gating/index.js";

import type { GatePolicy } from "./dispatch-inbound.js";

/** Deployment policy for {@link makeAllowlistGatePolicy}. */
export interface AllowlistGatePolicyOptions {
  /**
   * Principals allowed to invoke the assistant. Each entry is matched
   * case-insensitively against the sender's id / username / name / E.164. The
   * literal `"*"` is an explicit wildcard that authorizes every sender. An empty
   * (or omitted) allowlist authorizes NO direct sender — only an explicit
   * `directMessagesAllowed` opt-in lets unlisted DMs through.
   */
  readonly allowlist?: readonly string[];
  /**
   * When true, direct (1:1) messages are authorized even when the sender is not
   * on the allowlist. Group/channel messages always require an allowlist match.
   * Defaults to false (hostile-by-default).
   */
  readonly directMessagesAllowed?: boolean;
  /**
   * Require an explicit @mention before acting in a group/channel. Defaults to
   * true — the assistant stays quiet in groups unless addressed.
   */
  readonly requireMentionInGroups?: boolean;
  /**
   * Whether the channel can actually report mentions (drives mention gating: a
   * channel that cannot detect mentions must not silently drop group traffic).
   * Defaults to true; set false for channels with no mention signal.
   */
  readonly canDetectMention?: boolean;
  /** Allow text control-commands (e.g. `/reset`). Defaults to false. */
  readonly allowTextCommands?: boolean;
  /**
   * Control-command prefixes (e.g. `["/", "!"]`). A normalized message whose
   * trimmed text starts with one of these is treated as a control command.
   * Only consulted when `allowTextCommands` is true.
   */
  readonly commandPrefixes?: readonly string[];
  /**
   * Whether access groups gate command authorization. Defaults to false (the
   * allowlist alone authorizes commands).
   */
  readonly useAccessGroups?: boolean;
}

/** The candidate identity strings an allowlist entry is matched against. */
function senderMatchKeys(sender: SenderIdentity): string[] {
  const keys: string[] = [];
  const push = (value?: string): void => {
    const trimmed = value?.trim().toLowerCase();
    if (trimmed) {
      keys.push(trimmed);
      // `@handle` and `handle` are the same principal for allowlist purposes.
      if (trimmed.startsWith("@")) {
        keys.push(trimmed.slice(1));
      }
    }
  };
  push(sender.SenderId);
  push(sender.SenderUsername);
  push(sender.SenderName);
  push(sender.SenderE164);
  return keys;
}

/** True when `sender` matches any allowlist entry (wildcard or identity). */
export function senderAllowlisted(
  sender: SenderIdentity,
  allowlist: readonly string[],
): boolean {
  if (allowlist.length === 0) {
    return false;
  }
  const normalizedEntries = allowlist.map((entry) => entry.trim().toLowerCase());
  if (normalizedEntries.includes("*")) {
    return true;
  }
  const keys = new Set(senderMatchKeys(sender));
  return normalizedEntries.some((entry) => {
    if (!entry) {
      return false;
    }
    if (keys.has(entry)) {
      return true;
    }
    // Honor an entry written with a leading "@" against a bare handle and vice versa.
    if (entry.startsWith("@") && keys.has(entry.slice(1))) {
      return true;
    }
    return false;
  });
}

function isGroupChat(chatType: ChatType): boolean {
  return chatType === "group" || chatType === "channel";
}

/** True when `text` begins with one of the configured control-command prefixes. */
export function hasControlCommand(
  text: string,
  commandPrefixes: readonly string[],
): boolean {
  const trimmed = text.trimStart();
  if (!trimmed) {
    return false;
  }
  return commandPrefixes.some((prefix) => {
    const p = prefix.trim();
    // A prefix immediately followed by a non-space command character (e.g. `/reset`).
    return p.length > 0 && trimmed.startsWith(p) && trimmed.length > p.length;
  });
}

/**
 * Build a real {@link GatePolicy} from a normalized message and a deployment
 * policy. The returned policy is pure and synchronous; plug it straight into
 * `dispatchInbound`'s `gatePolicy` to take any adapter live end-to-end behind
 * the trust boundary.
 */
export function makeAllowlistGatePolicy(
  options: AllowlistGatePolicyOptions = {},
): GatePolicy {
  const allowlist = options.allowlist ?? [];
  const directMessagesAllowed = options.directMessagesAllowed ?? false;
  const requireMentionInGroups = options.requireMentionInGroups ?? true;
  const canDetectMention = options.canDetectMention ?? true;
  const allowTextCommands = options.allowTextCommands ?? false;
  const commandPrefixes = options.commandPrefixes ?? [];
  const useAccessGroups = options.useAccessGroups ?? false;

  return (message: NormalizedInboundMessage): GateInput => {
    const isGroup = isGroupChat(message.chatType);
    const matched = senderAllowlisted(message.sender, allowlist);
    // A direct message may be authorized by an explicit DM opt-in; group/channel
    // traffic always requires an allowlist match.
    const allowlisted = matched || (!isGroup && directMessagesAllowed);

    const messageHasCommand =
      allowTextCommands && hasControlCommand(message.text, commandPrefixes);

    return {
      allowlisted,
      isGroup,
      requireMention: isGroup ? requireMentionInGroups : false,
      canDetectMention,
      wasMentioned: message.wasMentioned,
      allowTextCommands,
      hasControlCommand: messageHasCommand,
      useAccessGroups,
      // When an allowlisted principal speaks, treat them as a configured+allowed
      // command authorizer so the command gate matches the allowlist decision.
      authorizers: matched ? [{ configured: true, allowed: true }] : [],
    };
  };
}
