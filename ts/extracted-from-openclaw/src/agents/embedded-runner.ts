// Owned by Recoder. The embedded pi-agent runner contract, distilled from
// agents/agents/pi-embedded-runner/* and pi-embedded-helpers/*. The raw runner
// imports a large monorepo surface (config/sessions, infra, auto-reply) that
// was not part of the extraction; this module owns the runner's PUBLIC contract
// — run an embedded pi agent turn and stream its output — so connectors can
// drive an agent without depending on the un-extracted internals. The concrete
// pi-coding-agent wiring is attached in a later phase behind this interface.

import type { AuthProfileCredential } from "./auth-profiles.js";

/** A single agent turn request. */
export interface EmbeddedRunRequest {
  /** Logical agent id (selects auth profile order, lane, history). */
  readonly agentId: string;
  /** Session/conversation id the turn belongs to. */
  readonly sessionId: string;
  /** The user/connector prompt for this turn. */
  readonly prompt: string;
  /** Model id override (else the agent's configured default is used). */
  readonly model?: string;
  /** Credential to run under (resolved by auth-profile rotation). */
  readonly credential?: AuthProfileCredential;
  /** AbortSignal to cancel an in-flight turn. */
  readonly signal?: AbortSignal;
}

/** A streamed chunk of agent output. */
export type EmbeddedRunEvent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly text: string }
  | { readonly type: "tool-call"; readonly name: string; readonly input: unknown }
  | { readonly type: "tool-result"; readonly name: string; readonly output: unknown }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "done"; readonly usage?: EmbeddedRunUsage };

/** Token/usage accounting for a completed turn (truthful, never faked). */
export interface EmbeddedRunUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

/**
 * The embedded agent runner. A connector turns a gated, normalized inbound
 * message into an `EmbeddedRunRequest` and consumes the streamed events.
 */
export interface EmbeddedRunner {
  /** Run one agent turn, yielding streamed events until `done`. */
  run(request: EmbeddedRunRequest): AsyncIterable<EmbeddedRunEvent>;
}
