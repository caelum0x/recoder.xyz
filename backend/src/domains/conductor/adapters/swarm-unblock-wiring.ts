/**
 * `createSwarmUnblockDeps` — the REAL wiring for the swarm auto-unblock seams
 * (LOOM-ROADMAP.md #3). It binds the seven INJECTED seams of
 * {@link SwarmUnblockService} to concrete Recoder systems, so the governed
 * `recoder_swarm_unblock` tool stops returning `SERVICE_UNAVAILABLE` and instead
 * runs the escalate-by-default decision loop over live sources:
 *
 *  - `agentRead`     → the loom control API (`agent.read` recent, strip-ANSI) on
 *    the blocked pane's terminal id (the workspace's persisted `sessionName`).
 *    Any fault / no live session ⇒ `null` (the service escalates truthfully).
 *  - `agentPrompt`   → the loom control API (`agent.prompt`) into that SAME live
 *    pane. No live session / a non-`agent_prompted` reply THROWS (a failed
 *    delivery is surfaced, never faked).
 *  - `memorySearch`  → the memory fusion recall (mem0 ∪ beads ∪ candidates ∪
 *    items ∪ colbert). Each recalled memory becomes a candidate carrying its REAL
 *    provenance as evidence and its recall score as confidence. Recall hits are
 *    classified `risk:'medium'` — a raw recalled fact is a human-reviewable
 *    PROPOSAL that rides the escalation, never an auto-answer (only a same-group
 *    sibling precedent is auto-answerable).
 *  - `siblingDecision` → the converge compare path: enumerate the taskGroup's
 *    OTHER workspaces, read each sibling's live pane, and (only when a sibling has
 *    demonstrably moved PAST the SAME question) quote its verbatim follow-on line
 *    as a low-risk, evidenced precedent. No such sibling ⇒ `null`.
 *  - `policyGate`    → the deterministic `evaluatePolicy` (agent-policy). The
 *    auto-answer is modeled as a benign `tool.call` on `swarm.unblock`; the
 *    verdict flows back verbatim (`allow` | `deny` | `needs_approval`).
 *  - `approvalGate`  → the real `ApprovalService.request` (governance domain),
 *    returning the durable approval id as the escalation `requestId`.
 *  - `rememberCandidate` → the evidenced memory-candidate lifecycle
 *    (`CandidateService.propose`). Best-effort: the service already isolates a
 *    candidate-store fault so it never un-delivers an answer.
 *
 * TRUTHFULNESS: every adapter degrades truthfully — an unreadable pane escalates,
 * a store/engine fault surfaces or is isolated by the service, and no adapter ever
 * fabricates a candidate, an answer, or an approval id.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import { evaluatePolicy, type PolicyInput } from '@recoder/agent-policy';
import type { Principal } from '../../identity/types.js';
import type { RiskTier } from '../../governance/types.js';
import type { ApprovalService } from '../../governance/services/approval.service.js';
import type { RecallService } from '../../memory/recall/recall-fusion.js';
import type { CandidateService } from '../../memory/lifecycle/candidate-service.js';
import type { CompareView } from '../services/compare.service.js';
import type { LoomClientPort } from './loom-substrate.adapter.js';
import {
  parseBlockedProvenance,
  type AgentInfo,
  type BlockedKind,
  type LoomResult,
} from '@recoder/agent-runtimes/loom';
import type {
  SwarmUnblockDeps,
  UnblockCandidate,
  UnblockRisk,
} from '../swarm/swarm-unblock.service.js';

/** How many trailing pane lines the loom read captures for the question probe. */
const READ_LINES = 200;
/** How many memories the recall fusion returns per unblock probe. */
const MEMORY_LIMIT = 5;
/** Confidence assigned to a real same-group sibling precedent (auto-answerable). */
const SIBLING_CONFIDENCE = 0.9;
/** Upper bound on a quoted sibling answer line (a longer line is treated as noise). */
const MAX_SIBLING_ANSWER_LEN = 500;

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/** The narrow seams this wiring composes over (all already built at bootstrap). */
export interface SwarmUnblockWiringDeps {
  /** The loom control-API client (same daemon socket the loom substrate drives). */
  readonly loom: LoomClientPort;
  /** Resolve a workspace record (for its loom `sessionName` target). Late-bound. */
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  /** The taskGroup compare read (the converge sibling source). Late-bound. */
  readonly compareGroup: (
    taskGroup: string,
    principal: Principal
  ) => Promise<CompareView>;
  /** The memory fusion recall seam. */
  readonly recall: RecallService;
  /** The control-plane approval-gate lifecycle. */
  readonly approvals: ApprovalService;
  /** The evidenced memory-candidate lifecycle. */
  readonly candidates: CandidateService;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
}

/** Narrow a loom result to a `pane_read`'s text, or `null` for anything else. */
function paneText(res: LoomResult): string | null {
  if (res.type !== 'pane_read') return null;
  return (res as Extract<LoomResult, { type: 'pane_read' }>).read.text;
}

/** Narrow a loom result to its `agent_info` `AgentInfo`, or `null` for anything else. */
function agentInfo(res: LoomResult): AgentInfo | null {
  if (res.type !== 'agent_info') return null;
  return (res as Extract<LoomResult, { type: 'agent_info' }>).agent;
}

/** Map the candidate's coarse risk to a governance approval tier (never fabricated). */
function toRiskTier(risk: UnblockRisk | undefined): RiskTier {
  if (risk === 'low') return 'low';
  if (risk === 'high') return 'high';
  return 'medium';
}

/** Trim a string to a bounded length for a title/label (never throws). */
function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * A permissive-but-honest {@link import('@recoder/agent-policy').PolicyInput}'s
 * actor derived from the invoking principal. The deterministic gate evaluates the
 * ACTION (a benign `swarm.unblock` tool call), not a per-agent permission matrix;
 * a human owner carries no tool-deny rules, so the gate's verdict is driven by the
 * action rules alone. Only the fields the policy rules read are populated.
 */
function policyActor(actor: Principal): PolicyInput['actor'] {
  const nowIso = new Date(0).toISOString();
  return {
    agentId: actor.userId,
    displayName: actor.userId,
    vendorSurface: 'custom',
    connectorId: 'recoder',
    runtimeKind: 'local',
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: 'allow',
      pathRules: [],
      toolRules: [],
      allowNetwork: true,
      allowShell: false,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: false,
    },
    approvalPolicy: {
      mode: 'policy',
      requiredRules: [],
      allowAutoApprovalForLowRisk: true,
    },
    memoryScope: 'repo',
    cwdPolicy: { mode: 'workspace_root', allowedRoots: [] },
    health: { status: 'healthy', checkedAt: nowIso },
    lastSeenAt: nowIso,
  };
}

/**
 * Extract a sibling's VERBATIM answer to `question` from its pane tail: the first
 * non-empty, non-question line strictly AFTER the LAST occurrence of the question
 * (i.e. the sibling encountered the same prompt and moved past it). Returns `null`
 * when the sibling has not passed this decision point — never a fabricated answer.
 */
export function extractSiblingAnswer(
  tail: string | null,
  question: string
): string | null {
  if (tail == null) return null;
  const needle = question.trim().toLowerCase();
  if (needle.length === 0) return null;
  const lines = tail
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  let lastQuestionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(needle)) lastQuestionIdx = i;
  }
  // No occurrence, or the question is the sibling's LAST line ⇒ it is still
  // blocked on the same prompt (has not decided) ⇒ no precedent.
  if (lastQuestionIdx < 0 || lastQuestionIdx >= lines.length - 1) return null;

  for (let i = lastQuestionIdx + 1; i < lines.length; i++) {
    const candidate = lines[i];
    if (candidate.endsWith('?')) continue; // another prompt, not an answer
    if (candidate.length > MAX_SIBLING_ANSWER_LEN) return null;
    return candidate;
  }
  return null;
}

/**
 * Build the concrete {@link SwarmUnblockDeps} bundle. Injected into the conductor
 * module (`deps.swarmUnblock`) so `resolveSwarmUnblock` composes real sources
 * through the pure {@link SwarmUnblockService}.
 */
export function createSwarmUnblockDeps(
  deps: SwarmUnblockWiringDeps
): SwarmUnblockDeps {
  const logger = deps.logger ?? NOOP_LOGGER;

  /** Resolve a workspace's loom terminal id (`sessionName`) target, or `null`. */
  async function loomTarget(workspaceId: string): Promise<string | null> {
    const ws = await deps.getWorkspace(workspaceId);
    const session = ws?.sessionName;
    return session != null && session.trim() !== '' ? session : null;
  }

  /** Read a live loom pane's recent (strip-ANSI) text by target, or `null`. */
  async function readPane(target: string): Promise<string | null> {
    const res = await deps.loom.call('agent.read', {
      target,
      source: 'recent',
      lines: READ_LINES,
      strip_ansi: true,
    });
    return paneText(res);
  }

  return {
    agentRead: {
      async readRecent(workspaceId: string): Promise<string | null> {
        const target = await loomTarget(workspaceId);
        if (target == null) return null;
        try {
          return await readPane(target);
        } catch {
          return null; // dead handle / unreachable daemon ⇒ escalate truthfully
        }
      },
    },

    blockedKindRead: {
      async read(workspaceId: string): Promise<BlockedKind | undefined> {
        const target = await loomTarget(workspaceId);
        if (target == null) return undefined;
        try {
          const res = await deps.loom.call('agent.get', { target });
          const agent = agentInfo(res);
          if (agent == null) return undefined;
          // Only the DECLARED taxonomy off the live AgentInfo -- manifest-less /
          // hook-decided panes carry none ⇒ undefined (never fabricated).
          return parseBlockedProvenance(agent).agentBlockedKind;
        } catch {
          return undefined; // dead handle / unreachable daemon ⇒ no provenance
        }
      },
    },

    agentPrompt: {
      async deliver(input: {
        readonly workspaceId: string;
        readonly text: string;
        readonly actor: Principal;
      }): Promise<void> {
        const target = await loomTarget(input.workspaceId);
        if (target == null) {
          throw new Error(
            `loom: no live session to deliver an answer to ${input.workspaceId}`
          );
        }
        const res = await deps.loom.call('agent.prompt', {
          target,
          text: input.text,
        });
        if (res.type !== 'agent_prompted') {
          throw new Error(
            `loom agent.prompt returned '${res.type}', expected 'agent_prompted'`
          );
        }
      },
    },

    memorySearch: {
      async search(
        question: string,
        actor: Principal
      ): Promise<readonly UnblockCandidate[]> {
        const result = await deps.recall.recall({
          query: question,
          userId: actor.userId,
          limit: MEMORY_LIMIT,
          ...(actor.orgId ? { scope: 'org', scopeRef: actor.orgId } : {}),
        });
        return result.memories
          .filter(memory => memory.body != null && memory.body.trim() !== '')
          .map<UnblockCandidate>(memory => ({
            answer: memory.body,
            source: `memory:${memory.provenance.source}`,
            confidence: memory.provenance.score,
            // A raw recalled fact carries no proven low-risk classification, so it
            // is a human-reviewable PROPOSAL (never auto-answered) — truthful.
            risk: 'medium',
            evidence: `${memory.provenance.source}:${memory.provenance.ref}${
              memory.title ? ` — ${memory.title}` : ''
            }`,
          }));
      },
    },

    siblingDecision: {
      async find(request: {
        readonly taskGroup: string;
        readonly workspaceId: string;
        readonly question: string;
        readonly actor: Principal;
      }): Promise<UnblockCandidate | null> {
        const view = await deps.compareGroup(request.taskGroup, request.actor);
        for (const sibling of view.siblings) {
          if (sibling.workspaceId === request.workspaceId) continue;
          const target = sibling.sessionName;
          if (target == null || target.trim() === '') continue;
          let tail: string | null;
          try {
            tail = await readPane(target);
          } catch {
            continue; // an unreadable sibling contributes nothing (never faked)
          }
          const answer = extractSiblingAnswer(tail, request.question);
          if (answer != null) {
            return {
              answer,
              source: `sibling:${sibling.workspaceId}`,
              confidence: SIBLING_CONFIDENCE,
              // A same-group sibling that already passed THIS decision is a real,
              // low-risk precedent — the answer is quoted VERBATIM from its pane.
              risk: 'low',
              evidence: `sibling ${sibling.workspaceId} already answered the same prompt: ${answer}`,
            };
          }
        }
        return null;
      },
    },

    policyGate: {
      async evaluate(request: {
        readonly workspaceId: string;
        readonly question: string;
        readonly candidate: UnblockCandidate;
        readonly actor: Principal;
      }): Promise<{ readonly effect: 'allow' | 'deny' | 'needs_approval' }> {
        const verdict = evaluatePolicy({
          actor: policyActor(request.actor),
          action: 'tool.call',
          target: { toolName: 'swarm.unblock' },
        });
        return { effect: verdict.effect };
      },
    },

    approvalGate: {
      async request(input: {
        readonly workspaceId: string;
        readonly question: string | null;
        readonly candidate: UnblockCandidate | null;
        readonly reason: string;
        readonly taskGroup: string | undefined;
        readonly blockedKind?: BlockedKind;
        readonly actor: Principal;
      }): Promise<{ readonly requestId: string }> {
        const reasonParts = [input.reason];
        if (input.blockedKind)
          reasonParts.push(`blocked kind: ${input.blockedKind}`);
        if (input.question) reasonParts.push(`question: ${input.question}`);
        if (input.candidate) {
          reasonParts.push(
            `proposal (${input.candidate.source}): ${input.candidate.answer}`
          );
        }
        const record = await deps.approvals.request({
          action: 'workspace.unblock',
          riskTier: toRiskTier(input.candidate?.risk),
          requestedBy: input.actor.userId,
          taskId: input.taskGroup ?? input.workspaceId,
          reason: reasonParts.join(' — '),
          target: input.workspaceId,
        });
        return { requestId: record.id };
      },
    },

    rememberCandidate: {
      async remember(input: {
        readonly workspaceId: string;
        readonly taskGroup: string | undefined;
        readonly question: string;
        readonly answer: string;
        readonly source: string;
        readonly evidence: string;
        readonly blockedKind?: BlockedKind;
        readonly actor: Principal;
      }): Promise<void> {
        const kindLine = input.blockedKind
          ? `\nblocked kind: ${input.blockedKind}`
          : '';
        await deps.candidates.propose({
          userId: input.actor.userId,
          scope: 'repo',
          title: truncate(input.question, 120),
          body: `Q: ${input.question}\nA: ${input.answer}\nsource: ${input.source}\nevidence: ${input.evidence}${kindLine}`,
          proposedBy: input.actor.userId,
          evidence: {
            taskId: input.taskGroup ?? input.workspaceId,
            artifactId: `swarm-unblock:${input.workspaceId}`,
          },
        });
        logger.info('swarm unblock recorded an evidenced memory candidate', {
          workspaceId: input.workspaceId,
          source: input.source,
        });
      },
    },
  };
}
