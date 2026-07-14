// Owned by Recoder. The connector trust boundary (interop §7.4 connectors/gating/).
// Composes the three real, pure gates — allowlist (who may invoke), mention
// (require an explicit @mention to act), command (allowlisted commands only) —
// into a single decision. An inbound message that fails gating produces NO
// control-plane action. This is the executable form of "never trust
// unauthenticated connector traffic" (interop §2).

export * from "./allowlist-match.js";
export * from "./mention-gating.js";
export * from "./command-gating.js";

import { resolveMentionGatingWithBypass } from "./mention-gating.js";
import { resolveControlCommandGate, type CommandAuthorizer } from "./command-gating.js";

/** The combined gating decision for one inbound message. */
export interface GateDecision {
  /** True when the message must be dropped (no control-plane action). */
  readonly blocked: boolean;
  /** Whether the principal is authorized to invoke control commands. */
  readonly commandAuthorized: boolean;
  /** Whether the mention requirement was bypassed by an authorized command. */
  readonly mentionBypassed: boolean;
  /** Human-readable reason when blocked, for audit logging. */
  readonly reason?: string;
}

/** Inputs to the combined trust-boundary gate. */
export interface GateInput {
  /** Has the inbound sender already cleared the allowlist? */
  readonly allowlisted: boolean;
  readonly isGroup: boolean;
  readonly requireMention: boolean;
  readonly canDetectMention: boolean;
  readonly wasMentioned: boolean;
  readonly implicitMention?: boolean;
  readonly hasAnyMention?: boolean;
  readonly allowTextCommands: boolean;
  readonly hasControlCommand: boolean;
  /** Whether access groups are enforced for command authorization. */
  readonly useAccessGroups: boolean;
  readonly authorizers: CommandAuthorizer[];
}

/**
 * Run the full connector trust boundary. Order: allowlist → command-auth →
 * mention. Any failing gate yields `blocked: true` and the message is dropped.
 */
export function resolveGate(input: GateInput): GateDecision {
  if (!input.allowlisted) {
    return {
      blocked: true,
      commandAuthorized: false,
      mentionBypassed: false,
      reason: "sender not on allowlist",
    };
  }

  const command = resolveControlCommandGate({
    useAccessGroups: input.useAccessGroups,
    authorizers: input.authorizers,
    allowTextCommands: input.allowTextCommands,
    hasControlCommand: input.hasControlCommand,
  });

  if (command.shouldBlock) {
    return {
      blocked: true,
      commandAuthorized: command.commandAuthorized,
      mentionBypassed: false,
      reason: "control command not authorized",
    };
  }

  const mention = resolveMentionGatingWithBypass({
    isGroup: input.isGroup,
    requireMention: input.requireMention,
    canDetectMention: input.canDetectMention,
    wasMentioned: input.wasMentioned,
    implicitMention: input.implicitMention,
    hasAnyMention: input.hasAnyMention,
    allowTextCommands: input.allowTextCommands,
    hasControlCommand: input.hasControlCommand,
    commandAuthorized: command.commandAuthorized,
  });

  if (mention.shouldSkip) {
    return {
      blocked: true,
      commandAuthorized: command.commandAuthorized,
      mentionBypassed: mention.shouldBypassMention,
      reason: "mention required but not present",
    };
  }

  return {
    blocked: false,
    commandAuthorized: command.commandAuthorized,
    mentionBypassed: mention.shouldBypassMention,
  };
}
