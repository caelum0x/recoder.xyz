/**
 * `AgentTurnPort` — the NARROW agent-turn slice the `in_process` (openfang)
 * conductor substrate consumes: `run`/`continueRun` over the native openfang
 * kernel, each taking a PER-CALL {@link OpenfangRunEventSink}.
 *
 * The per-call sink is the load-bearing part of the contract. The substrate
 * builds a per-turn `bufferSink` and passes it here, so `capture()` (buffered
 * transcript) AND token metering (the terminal token-bearing event forwarded to
 * the late-bound completion-hook sink) keep working. A frozen JSON transport with
 * no sink slot could NOT express this — routing a turn through such a transport
 * would silently drop the buffer sink and break both.
 *
 * The engines-domain `AgentEngineService` (`engines.agentEngine()`) satisfies this
 * port STRUCTURALLY; bootstrap injects it at the composition root. Declared here
 * (consumer-owned) so the conductor NEVER imports the engines domain — the types
 * below mirror the engines facet's streaming shapes structurally, keeping the
 * boundary clean.
 *
 * DEGRADE LAW: never throws across the seam. When the openfang engine is
 * absent/boot-failed, `run`/`continueRun` resolve `{ available:false, reason }`
 * (no events emitted, no fabricated turn), and the substrate refuses truthfully.
 */
import type { RunEvent } from '@recoder/agent-os';

/**
 * Minimal RunEvent sink — structurally identical to `@recoder/substrate`'s
 * `RunEventSink` and the engines `OpenfangRunEventSink`. The substrate hands the
 * per-turn buffer sink in through this slot; the turn emits `started`/`log`/
 * `completed`/`failed` events into it.
 */
export interface OpenfangRunEventSink {
  append(event: RunEvent): Promise<void> | void;
}

/** Input to one in-process agent turn (the conductor worktree stays the caller's concern). */
export interface AgentTurnInput {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly prompt: string;
  readonly agentName?: string;
  readonly worktreePath?: string;
  /** Signed manifest envelope; verified + gated (provenance) before a fresh spawn. */
  readonly signedManifestJson?: string;
}

/** One in-process agent turn → honest RunEvents. Mirrors the engines `AgentTurnResult`. */
export type AgentTurnResult =
  /** Engine absent / kernel boot failed — truthful degrade, no events emitted. */
  | { available: false; reason: string }
  /** Turn completed; `response` is the agent's answer for this turn. */
  | {
      available: true;
      ok: true;
      agentId: string;
      response: string;
      iterations?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  /** Engine present but the spawn/run failed — a `failed` RunEvent was emitted. */
  | { available: true; ok: false; error: string };

/**
 * The narrow agent-turn slice the `in_process` substrate consumes. Each method
 * takes a PER-CALL sink (see file header). Injected by bootstrap as the engines
 * facet; OPTIONAL on the substrate (absent ⇒ the substrate reports unavailable
 * truthfully, per the commit-2↔3 wiring window).
 */
export interface AgentTurnPort {
  /**
   * Run ONE in-process agent turn against `input.worktreePath`, emitting honest
   * `started`/`log`/`completed` (or `failed`) RunEvents to the PER-CALL `sink`.
   * Never throws — `{ available:false }` when the engine is absent/boot-failed.
   */
  run(input: AgentTurnInput, sink: OpenfangRunEventSink): Promise<AgentTurnResult>;
  /** Follow-up turn — reuse-by-name so the kernel session continues (steer/chat). */
  continueRun(input: AgentTurnInput, sink: OpenfangRunEventSink): Promise<AgentTurnResult>;
}
