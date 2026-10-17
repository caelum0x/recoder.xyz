/**
 * `createT3WriteCommandGate` — the governance seam docs/T3CODE-FORK.md's
 * patch queue #2 names ("orchestration-v2 `CommandPolicy` + `EffectWorker`
 * call the Recoder backend over loopback before every write/merge/other side
 * effect") and docs/RECODER-T3CODE-COMPOSITION.md section 5 calls out as
 * "the Governance seam": `third_party/t3code/apps/server` is a NEW
 * write-capable surface this repo's governance scope did not cover before
 * today — worktree creation, PR linking/creation, checkpoint revert — on top
 * of the terminal-write path `@recoder/t3-bridge`'s
 * `createT3TerminalCommandGate` already gates.
 *
 * This is deliberately a THIRD, independent `CommandGate` + `FileAuditLog`
 * instance (own audit log file), not a reuse of `conductorCommandGate` (the
 * Loom raw-PTY steer gate) or the t3-bridge terminal gate — same reasoning
 * `command-gate.adapter.ts`'s own header already gives for why ITS gate is
 * separate from the coarse `GovernanceGateService`: each gate reasons about
 * a structurally different "command" string (literal PTY bytes vs. a
 * terminal write vs., here, a short write/merge-action descriptor like
 * `"pr.link github.com/org/repo#42"`), and keeping them independently
 * instantiated keeps each one independently testable.
 *
 * WHY THIS IS A LOOPBACK HTTP ADAPTER, NOT AN IMPORTED PACKAGE: unlike the
 * terminal seam (`packages/t3-bridge`, importable from apps/server's OWN
 * process because — per that package's own README — `@t3tools/contracts` is
 * the only workspace dependency crossing that boundary), `apps/server` lives
 * in `third_party/t3code`'s OWN nested pnpm workspace and cannot resolve a
 * root-workspace `@recoder/*` package (see `third_party/t3code/apps/server/
 * src/terminal/LoomTerminalManagerAdapter.ts`'s file header for the full
 * reasoning — adding `apps/server` to the root workspace would also drag in
 * its `@t3tools/web` Expo+Electron dev dependency). The composition doc's
 * own wording — "the t3 server asks the Recoder backend for verdicts... over
 * loopback" — already names HTTP, not an in-process import, as this seam's
 * shape. `internal-t3-write-gate.routes.ts` is the HTTP edge; this file is
 * what that edge calls into.
 */
import type { AgentProfile } from '@recoder/agent-os';
import {
  CommandGate,
  Governance,
  FileAuditLog,
  type RiskTier,
} from '@recoder/governance';
import type { LoggerPort } from '@recoder/substrate';

/**
 * The approval-visibility seam — structurally identical to
 * `CommandGateApprovalPort` / `AcpPermissionApprovalPort` / t3-bridge's
 * `T3CommandGateApprovalPort`. Kept local so this adapter does not
 * hard-couple to a concrete backend wiring type.
 */
export interface T3WriteGateApprovalPort {
  request(params: {
    readonly action: string;
    readonly riskTier: RiskTier;
    readonly requestedBy: string;
    readonly reason?: string | null;
    readonly taskId?: string | null;
    readonly target: string;
  }): Promise<{ readonly id: string }>;
}

/** The write/merge action vocabulary apps/server's new write-capable surface produces. */
export type T3WriteAction =
  | 'worktree.create'
  | 'worktree.remove'
  | 'pr.create'
  | 'pr.link'
  | 'pr.merge'
  | 'checkpoint.revert'
  | 'git.push';

export interface T3WriteGateRequest {
  /** The t3-side actor/session id this write is attributed to in the audit log. */
  readonly actorId: string;
  readonly action: T3WriteAction;
  /**
   * A short, literal, human-readable descriptor of WHAT is being written —
   * the string `@recoder/governance`'s policy chain actually classifies
   * (e.g. `"pr.create github.com/acme/widgets base=main head=feature-x"`).
   * Never a summary that hides the real target.
   */
  readonly target: string;
  /** Correlates the decision + audit entries to the originating t3 thread/run, if any. */
  readonly taskId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface T3WriteGateOutcome {
  readonly allowed: boolean;
  readonly reason: string;
  readonly tier?: string;
}

export interface CreateT3WriteCommandGateDeps {
  /** A dedicated `@recoder/governance` facade (own `Governance.create()`). */
  readonly governance: Governance;
  /** A dedicated durable audit log, e.g. `~/.recoder/audit/t3-write-gate.jsonl`. */
  readonly auditLog: FileAuditLog;
  /** Opens a durable, UI-visible approval record on `needs_approval`; absent ⇒ fail-closed with no record. */
  readonly approvals?: T3WriteGateApprovalPort;
  readonly logger?: LoggerPort;
}

export interface T3WriteCommandGate {
  gate(request: T3WriteGateRequest): Promise<T3WriteGateOutcome>;
}

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/**
 * The `AgentProfile` the policy chain reasons about for apps/server's own
 * write surface: git-write and PR-creation capable (that IS what this
 * surface does), no write-lock requirement (apps/server's own
 * `workspace/workspaceLease.ts` already owns worktree-level exclusivity
 * before this gate is ever reached — same division of responsibility as
 * `command-gate.adapter.ts`'s `interactiveSteerActor`). `allowShell: true`
 * even though this surface never shells out — `CommandGate`'s policy chain
 * classifies the literal `command` string uniformly regardless of what kind
 * of action produced it, and a benign write/merge descriptor (e.g.
 * `"pr.link github.com/acme/widgets#42"`) still needs that base permission
 * to clear as `allow` rather than denying everything outright (verified in
 * `t3-write-gate.adapter.test.ts`'s own allow-path suite). Genuinely
 * dangerous actions (a merge to a protected branch, a revert) still land on
 * `needs_approval`/`deny` on their own content-driven merits regardless.
 */
function t3WriteSurfaceActor(actorId: string): AgentProfile {
  const now = new Date().toISOString();
  return {
    agentId: actorId,
    displayName: actorId,
    vendorSurface: 'claude_code',
    connectorId: 'recoder-t3-write-gate',
    runtimeKind: 'local',
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'allow',
      pathRules: [],
      toolRules: [],
      allowNetwork: true,
      allowShell: true,
      allowGitWrite: true,
      allowPrCreation: true,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: false,
    },
    approvalPolicy: {
      mode: 'policy',
      requiredRules: [],
      allowAutoApprovalForLowRisk: false,
    },
    memoryScope: 'none',
    cwdPolicy: { mode: 'repo_root', allowedRoots: [] },
    health: { status: 'healthy', checkedAt: now },
    lastSeenAt: now,
  };
}

/** No real delivery happens here — apps/server performs the write itself, only AFTER `allowed: true` comes back. */
const NOOP_EXECUTOR = async () => ({ stdout: '', stderr: '', exitCode: 0 });

export function createT3WriteCommandGate(
  deps: CreateT3WriteCommandGateDeps,
): T3WriteCommandGate {
  const logger = deps.logger ?? NOOP_LOGGER;

  const gate = new CommandGate({
    governance: deps.governance,
    auditLog: deps.auditLog,
    executor: NOOP_EXECUTOR,
    approvalPrompt: deps.approvals
      ? async (details) => {
          try {
            await deps.approvals!.request({
              action: 'write.t3-action',
              riskTier: details.tier,
              requestedBy: details.requestId,
              reason: details.reason,
              target: details.command,
            });
          } catch (err) {
            logger.warn?.(
              't3-write-gate: failed to open durable approval — denying without a record',
              { err: err instanceof Error ? err.message : String(err) },
            );
          }
          // Deny-now / human-clears-it / next-attempt-succeeds — same
          // pattern every other gate in this repo already ships.
          return 'rejected';
        }
      : undefined,
  });

  return {
    async gate(request: T3WriteGateRequest): Promise<T3WriteGateOutcome> {
      const actor = t3WriteSurfaceActor(request.actorId);

      const result = await gate.gate({
        requestId: request.taskId,
        actor,
        command: `${request.action} ${request.target}`,
        requestedBy: request.actorId,
        context: {
          metadata: {
            ...(request.metadata ?? {}),
            t3Action: request.action,
            t3Target: request.target,
          },
        },
        executor: NOOP_EXECUTOR,
      });

      return {
        allowed: result.status === 'executed',
        reason: result.reason,
        tier: result.verdict.tier,
      };
    },
  };
}
