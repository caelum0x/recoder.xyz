/**
 * `createT3TerminalCommandGate` — the governance seam named by
 * `docs/T3CODE-FORK.md` section 3/4 ("patch #2: orchestration-v2
 * `CommandPolicy` + `EffectWorker` call the Recoder backend over loopback
 * before every write/merge/other side effect"): a t3-backed agent session's
 * terminal write — the literal text sent into a live PTY-backed session,
 * wire-shaped exactly like `@t3tools/contracts`'s `TerminalWriteInput` (see
 * `third_party/t3code/packages/contracts/src/terminal.ts`) — must clear
 * Recoder's own `CommandGate` BEFORE delivery, never after.
 *
 * This is the t3-side mirror of
 * `backend/src/domains/governance/adapters/command-gate.adapter.ts` (the
 * Loom raw-PTY steer gate): same `@recoder/governance` `CommandGate` +
 * `FileAuditLog` composition, same fail-closed contract (deny on `deny`,
 * deny-now on an unresolved `needs_approval`, never a silent allow or a
 * silent hang), different caller (a t3 terminal session instead of a Loom
 * pane). Approvals open through `@recoder/agent-os`'s real `ApprovalService`
 * by default (see `createApprovalPortFromApprovalService`) — the SAME
 * service `command-gate.adapter.ts`'s `CommandGateApprovalPort` composes
 * over — so a `needs_approval` verdict here surfaces in the same
 * `/api/agent-os/approvals` + desktop `InlineApprovalCard` UI as every other
 * governed write, not a second, t3-only approval surface.
 *
 * This file is the ONLY place in `packages/t3-bridge` — and, per
 * `T3CODE-FORK.md` section 3, the only place in the whole Recoder tree
 * outside the two named composition seams — that imports a type from
 * `@t3tools/contracts`. The import is `import type` only: `verbatimModuleSyntax`
 * erases it at build, so `effect` and the vendored `third_party/t3code` tree
 * are devDependencies here (needed to generate this package's `.d.ts`) and
 * NEVER reach a consumer's runtime dependency graph.
 */
import type { TerminalWriteInput } from '@t3tools/contracts';
import type { AgentProfile } from '@recoder/agent-os';
import { ApprovalService } from '@recoder/agent-os';
import {
  CommandGate,
  Governance,
  FileAuditLog,
  type RiskTier,
} from '@recoder/governance';
import type { LoggerPort } from '@recoder/substrate';

/**
 * The approval-visibility seam — structurally satisfied by
 * `@recoder/agent-os`'s `ApprovalService.request` (same contract
 * `backend`'s `CommandGateApprovalPort` / `AcpPermissionApprovalPort`
 * already use). Kept local so this adapter does not hard-couple to a
 * concrete backend wiring type.
 */
export interface T3CommandGateApprovalPort {
  request(params: {
    readonly action: string;
    readonly riskTier: RiskTier;
    readonly requestedBy: string;
    readonly reason?: string | null;
    readonly taskId?: string | null;
    readonly target: string;
  }): Promise<{ readonly id: string }>;
}

/**
 * Builds a {@link T3CommandGateApprovalPort} directly over a real
 * `@recoder/agent-os` `ApprovalService` instance — the default this module
 * wires when no port is injected (see `createT3TerminalCommandGate`'s
 * `approvals` default). Durable, UI-visible: the returned `Approval` is the
 * same domain record the `/api/agent-os/approvals` edge reads.
 */
export function createApprovalPortFromApprovalService(
  service: ApprovalService,
): T3CommandGateApprovalPort {
  return {
    async request(params) {
      const approval = service.request({
        taskId: params.taskId ?? 'unknown-t3-session',
        reason: params.reason ?? `t3 terminal write requires approval (risk tier: ${params.riskTier})`,
        requestedBy: params.requestedBy,
        target: { command: params.target },
        metadata: { action: params.action, riskTier: params.riskTier, source: 't3-bridge' },
      });
      return { id: approval.approvalId };
    },
  };
}

/**
 * A t3 terminal write request — the literal subset of
 * `@t3tools/contracts`'s `TerminalWriteInput` this bridge reasons about
 * (`threadId`/`terminalId` correlate the decision + audit trail to the
 * originating t3 session; `data` is the literal text being written into the
 * PTY and is what `CommandGate`'s policy chain actually evaluates).
 */
export type T3TerminalWriteRequest = Pick<TerminalWriteInput, 'threadId' | 'terminalId' | 'data'>;

export interface T3CommandGateRequest {
  /** The principal/agent id this write is attributed to in the audit log. */
  readonly actorId: string;
  /** The t3 terminal write being evaluated — never a summary. */
  readonly write: T3TerminalWriteRequest;
  /** Correlates the decision + audit entries to the originating t3 task/run, if any. */
  readonly taskId?: string;
  /** Free-form context merged into the governance request (e.g. t3 session metadata). */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * Performs the actual delivery into the t3 terminal session (the real
   * PTY write) — invoked ONLY once the gate allows. A thrown error here is
   * captured as the gate's own `execution_failed` outcome and still reaches
   * the audit log; it is rethrown to the caller afterward.
   */
  readonly deliver: () => Promise<void>;
}

export interface T3CommandGateOutcome {
  readonly allowed: boolean;
  readonly reason: string;
  readonly tier?: string;
}

export interface CreateT3TerminalCommandGateDeps {
  /** A dedicated `@recoder/governance` facade (own `Governance.create()`). */
  readonly governance: Governance;
  /** A dedicated durable audit log, e.g. `~/.recoder/audit/t3-terminal-command-gate.jsonl`. */
  readonly auditLog: FileAuditLog;
  /**
   * Opens a durable, UI-visible approval record on `needs_approval`.
   * Defaults to {@link createApprovalPortFromApprovalService} over a fresh
   * `ApprovalService` when omitted — unlike the Loom adapter, t3 sessions
   * always have SOME approval surface (there is no legitimate "no approvals
   * configured" t3 deployment), so this bridge does not make the port
   * optional.
   */
  readonly approvals?: T3CommandGateApprovalPort;
  readonly logger?: LoggerPort;
}

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/**
 * The `AgentProfile` the policy chain reasons about for a t3 terminal
 * session actor: shell + git-write capable (a live interactive terminal
 * session literally IS this), no write-lock requirement (callers decide
 * workspace-level write-lock/ownership before this gate is ever reached —
 * same division of responsibility as `command-gate.adapter.ts`'s
 * `interactiveSteerActor`), default-deny files. Genuinely dangerous
 * command PATTERNS still land on `needs_approval` regardless of this
 * profile's permissions — that classification is content-driven.
 */
function t3TerminalSessionActor(actorId: string): AgentProfile {
  const now = new Date().toISOString();
  return {
    agentId: actorId,
    displayName: actorId,
    vendorSurface: 'claude_code',
    connectorId: 'recoder-t3-bridge',
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
      allowPrCreation: false,
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

/** A locked-down default executor: every real call site supplies its own per-request `deliver`-backed executor, so this firing at all is a wiring bug, not a normal path. */
const REFUSE_DEFAULT_EXECUTOR = async (): Promise<never> => {
  throw new Error(
    'createT3TerminalCommandGate: default executor invoked without a per-request executor — ' +
      'every caller must supply its own delivery via T3CommandGateRequest.deliver.',
  );
};

export interface T3TerminalCommandGate {
  gate(request: T3CommandGateRequest): Promise<T3CommandGateOutcome>;
}

export function createT3TerminalCommandGate(
  deps: CreateT3TerminalCommandGateDeps,
): T3TerminalCommandGate {
  const logger = deps.logger ?? NOOP_LOGGER;
  const approvals = deps.approvals ?? createApprovalPortFromApprovalService(new ApprovalService());

  const gate = new CommandGate({
    governance: deps.governance,
    auditLog: deps.auditLog,
    executor: REFUSE_DEFAULT_EXECUTOR,
    approvalPrompt: async (details) => {
      try {
        await approvals.request({
          action: 'terminal.write',
          riskTier: details.tier,
          requestedBy: details.requestId,
          reason: details.reason,
          target: details.command,
        });
      } catch (err) {
        logger.warn?.(
          't3-terminal-command-gate: failed to open durable approval — denying without a record',
          { err: err instanceof Error ? err.message : String(err) },
        );
      }
      // Deny-now / human-clears-it / next-attempt-succeeds — the same
      // pattern `command-gate.adapter.ts` already ships for Loom steer, not
      // a live-blocking wait on this promise.
      return 'rejected';
    },
  });

  return {
    async gate(request: T3CommandGateRequest): Promise<T3CommandGateOutcome> {
      const actor = t3TerminalSessionActor(request.actorId);
      let deliveryError: unknown;

      const result = await gate.gate({
        requestId: request.taskId,
        actor,
        command: request.write.data,
        requestedBy: request.actorId,
        context: request.metadata
          ? {
              metadata: {
                ...request.metadata,
                t3ThreadId: request.write.threadId,
                t3TerminalId: request.write.terminalId,
              },
            }
          : {
              metadata: {
                t3ThreadId: request.write.threadId,
                t3TerminalId: request.write.terminalId,
              },
            },
        executor: async () => {
          try {
            await request.deliver();
            return { stdout: '', stderr: '', exitCode: 0 };
          } catch (err) {
            deliveryError = err;
            throw err;
          }
        },
      });

      if (result.status === 'execution_failed') {
        // Allowed by policy, but delivery itself faulted (e.g. the t3
        // terminal socket errored) — surface the real delivery error
        // exactly as it would have thrown without this gate in front of it.
        throw deliveryError instanceof Error ? deliveryError : new Error(result.reason);
      }

      return {
        allowed: result.status === 'executed',
        reason: result.reason,
        tier: result.verdict.tier,
      };
    },
  };
}
