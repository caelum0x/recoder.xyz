/**
 * `HostileMentionGate` — the hostile-by-default trust boundary between a verified
 * channel delivery and the control plane. It is the port `mention-gate.port.ts`
 * with the doctrine of `backend/src/connectors/connector-ingress-gate.ts` ported
 * behind the domain seam.
 *
 * Admission ladder (each step fails CLOSED):
 *   1. ALLOWLIST — empty allowlist admits NOTHING (`allowlist_empty`); a `*`
 *      wildcard is explicit allow-all; otherwise the sender id must be listed
 *      (`not_allowlisted`). A binding-backed `allow:true` for the chat_ref also
 *      satisfies this step (explicit opt-in).
 *   2. MENTION — when `requireMention`, a group message must @-mention this agent
 *      OR carry a control command (`not_mentioned`).
 *   3. COMMAND — parse `/run …` → conductor dispatch; anything else → reply turn.
 *   4. SIGNED VOUCH (optional) — when an ingress secret is configured, the
 *      admitted message is re-proven through the injected signed vouch; a failed
 *      vouch DROPS it (`vouch_rejected`).
 *
 * `admit` NEVER throws on untrusted input — every path returns a `MentionDecision`.
 */
import type { MentionGate } from '../ports/mention-gate.port.js';
import type { InboundEnvelope, MentionDecision, ParsedCommand } from '../types.js';

/** The gate's trust config (from `SocialConfig`). */
export interface MentionGateConfig {
  /** Channel-native sender ids/usernames; `*` = allow-all (explicit opt-in). */
  readonly allowlist: readonly string[];
  /** Require an @mention (or command) before acting in a group/channel. */
  readonly requireMention: boolean;
}

/** Optional signed-vouch re-admission (degrade-safe; absent ⇒ skipped). */
export interface SignedVouch {
  /** Return true when the (already-gated) message re-admits under the vouch. */
  vouch(env: InboundEnvelope): Promise<boolean> | boolean;
}

/** Optional binding lookup (explicit chat_ref opt-in overrides an empty allowlist). */
export interface BindingCheck {
  /** True when the connector+chat_ref is explicitly allow-listed via a binding. */
  isChatAllowed(env: InboundEnvelope): Promise<boolean> | boolean;
}

export interface MentionGateDeps {
  readonly config: MentionGateConfig;
  readonly signedVouch?: SignedVouch;
  readonly bindingCheck?: BindingCheck;
}

function decide(
  admitted: boolean,
  code: string,
  reason: string,
  extra?: Partial<MentionDecision>,
): MentionDecision {
  return { admitted, code, reason, ...extra };
}

/** Parse a leading `/command args` (or `!command`) out of the text. */
export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  const match = /^[/!]([a-zA-Z][\w-]*)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return { args: trimmed };
  return { command: match[1].toLowerCase(), args: match[2].trim() };
}

/** True when the message @-mentions this agent (channel flag or a mention token). */
function hasMention(env: InboundEnvelope): boolean {
  if (env.mentioned === true) return true;
  // Fallback structural check: an @-token anywhere in the text.
  return /(^|\s)@[\w.]+/.test(env.text);
}

/** Build the hostile-by-default mention gate. */
export function createHostileMentionGate(deps: MentionGateDeps): MentionGate {
  const { config, signedVouch, bindingCheck } = deps;
  const wildcard = config.allowlist.includes('*');
  const allowSet = new Set(config.allowlist.map((s) => s.trim()).filter((s) => s && s !== '*'));

  return {
    async admit(env: InboundEnvelope): Promise<MentionDecision> {
      // --- 1. ALLOWLIST (hostile-by-default) --------------------------------
      const bindingAllowed = bindingCheck ? Boolean(await safe(() => bindingCheck.isChatAllowed(env))) : false;
      if (!wildcard && allowSet.size === 0 && !bindingAllowed) {
        return decide(false, 'allowlist_empty', 'Empty allowlist and no binding — nothing is admitted (hostile-by-default).');
      }
      const senderAllowed = wildcard || allowSet.has(env.senderId) || bindingAllowed;
      if (!senderAllowed) {
        return decide(false, 'not_allowlisted', `Sender ${env.senderId} is not allowlisted for ${env.channel}.`);
      }

      // --- 3. COMMAND parse (needed for the mention decision) ---------------
      const command = parseCommand(env.text);
      const hasControl = Boolean(command.command);

      // --- 2. MENTION -------------------------------------------------------
      if (config.requireMention && !hasMention(env) && !hasControl) {
        return decide(false, 'not_mentioned', 'A mention or control command is required in this channel.');
      }

      // --- 4. SIGNED VOUCH (optional) ---------------------------------------
      if (signedVouch) {
        const ok = await safe(() => signedVouch.vouch(env));
        if (!ok) {
          return decide(false, 'vouch_rejected', 'Signed connector-ingress vouch failed — message dropped.');
        }
      }

      const dispatchKind = command.command === 'run' ? 'conductor' : 'reply';
      return decide(true, 'admitted', 'Inbound message admitted past the trust boundary.', {
        command,
        dispatchKind,
      });
    },
  };
}

/** Run a predicate, swallowing faults to a `false` (never leak a throw). */
async function safe(fn: () => Promise<boolean> | boolean): Promise<boolean> {
  try {
    return Boolean(await fn());
  } catch {
    return false;
  }
}
