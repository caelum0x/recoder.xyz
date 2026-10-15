// @effect-diagnostics globalTimersInEffect:off globalFetchInEffect:off preferSchemaOverJson:off -- the
// loopback HTTP call below is a plain `fetch()` with an `AbortController`
// timeout, same justification as LoomTerminalManagerAdapter.ts's suppression
// header: this file's wire-level code deliberately stays plain (no Effect
// HttpClient, no Schema-based JSON codec), kept minimal and dependency-free
// on purpose (see the rationale below) — only the OUTER `requireRecoderWriteApproval`
// Effect pipeline is Effect-idiomatic.
/**
 * RecoderWriteGate — docs/T3CODE-FORK.md patch-queue #2 ("orchestration-v2
 * `CommandPolicy` + `EffectWorker` call the Recoder backend over loopback
 * before every write/merge/other side effect"), docs/RECODER-T3CODE-
 * COMPOSITION.md section 5 ("Governance seam"):
 *
 *   "orchestration-v2 CommandPolicy and EffectWorker call the Recoder
 *   backend over loopback before every write, merge or other side effect.
 *   The backend returns the policy verdict, the exact-target approval,
 *   converge and governed merge, and the evidence record... Calls go one
 *   way: the t3 server asks the Recoder backend for verdicts. The backend
 *   never drives t3 state."
 *
 * `third_party/t3code/apps/server` is a NEW write-capable surface (worktree
 * create/remove, PR link/create/merge, checkpoint revert) this repo's
 * governance scope did not cover before today — the terminal-write path
 * (`@recoder/t3-bridge`'s `createT3TerminalCommandGate`) only ever gated the
 * literal bytes going into a live PTY session, never these structured
 * actions. This file is the thin client every write call site in this
 * directory calls through BEFORE performing its real side effect.
 *
 * WHY THIS IS A PLAIN `fetch()` LOOPBACK CALL, NOT AN IMPORTED PACKAGE: same
 * reasoning as `terminal/LoomTerminalManagerAdapter.ts`'s file header —
 * `apps/server` lives in `third_party/t3code`'s OWN nested pnpm workspace
 * and cannot resolve a root-workspace `@recoder/*` package without dragging
 * in `@t3tools/web`'s Expo+Electron tree. Unlike the terminal seam (which
 * HAD to duplicate a client, because Loom's socket has no HTTP front door),
 * this seam's own architecture doc already specifies HTTP ("over loopback")
 * as the wire — so there is nothing to duplicate; a plain `fetch()` IS the
 * canonical shape, needing zero new dependencies.
 *
 * Fail-closed: a network error, a non-2xx response, or a malformed body are
 * ALL treated as `denied` (never a fabricated allow) — same posture every
 * other gate in this repo ships (`command-gate.adapter.ts`,
 * `createT3TerminalCommandGate`). The base URL is read from
 * `RECODER_GOVERNANCE_GATE_URL` (falling back to the embedded backend's
 * default loopback port) and the service key from
 * `RECODER_INTERNAL_SERVICE_KEY` — both read once at call time, never cached
 * at module load, so a dev override takes effect without a restart.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const RecoderWriteGateAction = Schema.Literals([
  "worktree.create",
  "worktree.remove",
  "pr.create",
  "pr.link",
  "pr.merge",
  "checkpoint.revert",
  "git.push",
]);
export type RecoderWriteGateAction = typeof RecoderWriteGateAction.Type;

export interface RecoderWriteGateRequest {
  readonly actorId: string;
  readonly action: RecoderWriteGateAction;
  /** A literal, human-readable descriptor of what is being written — never a summary. */
  readonly target: string;
  readonly taskId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class RecoderWriteGateDeniedError extends Schema.TaggedError<RecoderWriteGateDeniedError>()(
  "RecoderWriteGateDeniedError",
  {
    action: Schema.String,
    target: Schema.String,
    reason: Schema.String,
    tier: Schema.optional(Schema.String),
    /** Set when the denial is a degrade (network/transport fault) rather than a real policy verdict. */
    degraded: Schema.optional(Schema.Boolean),
  },
) {
  override get message(): string {
    const prefix = this.degraded === true ? "degraded-deny" : "denied";
    return `Recoder write gate ${prefix} ${this.action} '${this.target}': ${this.reason}`;
  }
}

const DEFAULT_GATE_BASE_URL = "http://127.0.0.1:3100";
const GATE_PATH = "/internal/agent-os/t3-write-gate/decide";
const REQUEST_TIMEOUT_MS = 10_000;

interface GateDecisionResponse {
  readonly success?: boolean;
  readonly data?: {
    readonly allowed?: boolean;
    readonly reason?: string;
    readonly tier?: string;
  };
}

/**
 * Calls the Recoder backend's loopback write-gate edge and returns the raw
 * decision. Never throws on a transport/parse fault — degrades to a denied
 * decision with `degraded: true` so the caller can log the distinction
 * between "policy denied" and "the gate itself was unreachable", without
 * ever treating either as a silent allow.
 */
interface RecoderWriteGateDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly tier: string | undefined;
  readonly degraded: boolean;
}

const decide = (
  request: RecoderWriteGateRequest,
): Effect.Effect<RecoderWriteGateDecision> =>
  Effect.promise(async () => {
    const baseUrl = process.env.RECODER_GOVERNANCE_GATE_URL ?? DEFAULT_GATE_BASE_URL;
    const serviceKey = process.env.RECODER_INTERNAL_SERVICE_KEY ?? process.env.INTERNAL_SERVICE_KEY;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}${GATE_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(serviceKey ? { "x-internal-service-key": serviceKey } : {}),
        },
        body: JSON.stringify({
          actorId: request.actorId,
          action: request.action,
          target: request.target,
          taskId: request.taskId,
          metadata: request.metadata,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          allowed: false,
          reason: `write gate responded ${response.status}`,
          tier: undefined,
          degraded: true,
        };
      }
      const body = (await response.json()) as GateDecisionResponse;
      if (typeof body.data?.allowed !== "boolean") {
        return {
          allowed: false,
          reason: "write gate returned a malformed decision",
          tier: undefined,
          degraded: true,
        };
      }
      return {
        allowed: body.data.allowed,
        reason: body.data.reason ?? "",
        tier: body.data.tier,
        degraded: false,
      };
    } catch (cause) {
      return {
        allowed: false,
        reason: cause instanceof Error ? cause.message : "write gate request failed",
        tier: undefined,
        degraded: true,
      };
    } finally {
      clearTimeout(timer);
    }
  });

/**
 * Injectable so tests (and anything that wants to replace the real HTTP
 * loopback call) never need a live backend — same pattern as
 * `terminal/LoomTerminalManagerAdapter.ts`'s `LoomSocketPathRef`. The
 * default is the real `decide` above; a test provides
 * `Layer.succeed(RecoderWriteGateDeciderRef, fakeDecider)` instead of
 * standing up an HTTP server.
 */
export const RecoderWriteGateDeciderRef = Context.Reference<
  (request: RecoderWriteGateRequest) => Effect.Effect<RecoderWriteGateDecision>
>("server/orchestration-v2/RecoderWriteGateDecider", { defaultValue: () => decide });

/**
 * The seam every write call site in `orchestration-v2`/`git`/`checkpointing`
 * calls through. `yield* requireRecoderWriteApproval(...)` either succeeds
 * (the real write may proceed) or fails with {@link RecoderWriteGateDeniedError}
 * (the caller must NOT perform the write — same fail-closed contract as
 * every other gate in this repo).
 */
export const requireRecoderWriteApproval = (
  request: RecoderWriteGateRequest,
): Effect.Effect<void, RecoderWriteGateDeniedError> =>
  Effect.flatMap(RecoderWriteGateDeciderRef, (decider) => decider(request)).pipe(
    Effect.flatMap((decision) =>
      decision.allowed
        ? Effect.void
        : new RecoderWriteGateDeniedError({
            action: request.action,
            target: request.target,
            reason: decision.reason,
            tier: decision.tier,
            degraded: decision.degraded,
          }),
    ),
  );
