/**
 * `SwarmUnblockService` -- swarm auto-unblock (LOOM-ROADMAP.md section 1 build-now
 * #3). When a fanned Loom pane goes native-Blocked, this service RESOLVES the
 * blocking question from Recoder-only sources and, by DEFAULT, ESCALATES it through
 * the governance approval gate. An auto-answer is a narrow, opt-in exception -- it
 * fires ONLY when the caller's policy allows it AND a high-confidence, low-risk,
 * evidenced answer exists AND the deterministic policy gate returns `allow`.
 *
 * THIN COMPOSITION over already-shipped ops -- every heavy op is an INJECTED SEAM
 * ({@link SwarmUnblockDeps}), so the decision loop is unit-tested against fakes with
 * no real Loom daemon, memory engine, policy engine, or approval store:
 *  1. READ the blocking question via {@link SwarmUnblockAgentRead} (`agent.read`
 *     recent, strip-ANSI). A pane with no readable tail cannot be auto-answered --
 *     it escalates truthfully (never a fabricated question).
 *  2. GATHER candidate answers from Recoder-only sources: cross-runtime
 *     {@link SwarmUnblockMemorySearch} + a {@link SwarmUnblockSiblingDecision} (a
 *     sibling in the SAME `taskGroup` that already passed this decision point).
 *  3. DECIDE -- default = ESCALATE via {@link SwarmUnblockApprovalGate}
 *     (`recoder_request_approval`) -> `{ action:'escalated', requestId }`.
 *     Auto-answer ONLY when `policy.autoAnswer===true` AND the best candidate is
 *     high-confidence + low-risk + evidenced AND {@link SwarmUnblockPolicyGate}
 *     returns `allow` -> deliver via {@link SwarmUnblockAgentPrompt} (`agent.prompt`)
 *     and return `{ action:'answered', answer, source }`.
 *  4. Every INJECTED answer (only the answered path) is recorded as an EVIDENCED
 *     memory CANDIDATE via {@link SwarmUnblockRememberCandidate}
 *     (question + answer + source + evidence). Best-effort: a candidate-store fault
 *     never rolls back an already-delivered answer.
 *
 * TRUTHFULNESS INVARIANTS (non-negotiable):
 *  - NEVER auto-answer without a REAL candidate AND a policy `allow` verdict -- the
 *    default is escalate.
 *  - A policy `deny`/`needs_approval` verdict escalates (or refuses), never answers.
 *  - No candidate found => escalate; the answer is never fabricated.
 *  - The memory candidate is recorded ONLY when an answer is actually delivered
 *    AND it carries real evidence -- an unevidenced answer is not deliverable.
 */
import type { LoggerPort } from '@recoder/substrate';
import type { Principal } from '../../identity/types.js';

/** The risk classes a candidate answer may carry -- only `low` is auto-answerable. */
export type UnblockRisk = 'low' | 'medium' | 'high';

/** The confidence at/above which a candidate is "high-confidence" (auto-answer gate). */
export const DEFAULT_MIN_CONFIDENCE = 0.8;

/**
 * One Recoder-only candidate answer to a blocking question. It is only ever
 * AUTO-delivered when it is high-confidence, low-risk, AND carries real evidence;
 * otherwise it rides the escalation as a human-reviewable proposal.
 */
export interface UnblockCandidate {
  /** The proposed answer text delivered to the blocked pane (never fabricated). */
  readonly answer: string;
  /** Provenance label of the answer (`'memory'`, `'sibling'`, ...) -- recorded truthfully. */
  readonly source: string;
  /** Confidence in [0,1]; only `>= minConfidence` is auto-answerable. */
  readonly confidence: number;
  /** Risk class; only `'low'` is auto-answerable (anything riskier escalates). */
  readonly risk: UnblockRisk;
  /** REQUIRED evidence backing the answer; an empty evidence is not deliverable. */
  readonly evidence: string;
}

// --- injected seams ----------------------------------------------------------

/** Reads the blocked pane's recent output (`agent.read` recent) -- `null` when unreadable. */
export interface SwarmUnblockAgentRead {
  readRecent(workspaceId: string, actor: Principal): Promise<string | null>;
}

/** Searches cross-runtime memory for candidate answers to the question. */
export interface SwarmUnblockMemorySearch {
  search(
    question: string,
    actor: Principal
  ): Promise<readonly UnblockCandidate[]>;
}

/**
 * Finds a sibling in the SAME `taskGroup` that already passed THIS decision point
 * (from the compare/sibling state). `null` when there is no such sibling / no group.
 */
export interface SwarmUnblockSiblingDecision {
  find(request: {
    readonly taskGroup: string;
    readonly workspaceId: string;
    readonly question: string;
    readonly actor: Principal;
  }): Promise<UnblockCandidate | null>;
}

/** The deterministic policy verdict for an auto-answer (wraps `evaluatePolicy`). */
export interface SwarmUnblockPolicyGate {
  evaluate(request: {
    readonly workspaceId: string;
    readonly question: string;
    readonly candidate: UnblockCandidate;
    readonly actor: Principal;
  }): Promise<{ readonly effect: 'allow' | 'deny' | 'needs_approval' }>;
}

/** Opens an approval request (`recoder_request_approval`) -- returns its id. */
export interface SwarmUnblockApprovalGate {
  request(input: {
    readonly workspaceId: string;
    readonly question: string | null;
    /** The best candidate (a human-reviewable proposal), or `null` when none found. */
    readonly candidate: UnblockCandidate | null;
    readonly reason: string;
    readonly taskGroup: string | undefined;
    readonly actor: Principal;
  }): Promise<{ readonly requestId: string }>;
}

/** Delivers an approved answer into the live pane (`agent.prompt`). */
export interface SwarmUnblockAgentPrompt {
  deliver(input: {
    readonly workspaceId: string;
    readonly text: string;
    readonly actor: Principal;
  }): Promise<void>;
}

/** Records an evidenced memory CANDIDATE (never durable) for a delivered answer. */
export interface SwarmUnblockRememberCandidate {
  remember(input: {
    readonly workspaceId: string;
    readonly taskGroup: string | undefined;
    readonly question: string;
    readonly answer: string;
    readonly source: string;
    readonly evidence: string;
    readonly actor: Principal;
  }): Promise<void>;
}

/** Injected wiring for {@link SwarmUnblockService}. */
export interface SwarmUnblockDeps {
  readonly agentRead: SwarmUnblockAgentRead;
  readonly memorySearch: SwarmUnblockMemorySearch;
  readonly siblingDecision: SwarmUnblockSiblingDecision;
  readonly policyGate: SwarmUnblockPolicyGate;
  readonly approvalGate: SwarmUnblockApprovalGate;
  readonly agentPrompt: SwarmUnblockAgentPrompt;
  readonly rememberCandidate: SwarmUnblockRememberCandidate;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
}

// --- input / result ----------------------------------------------------------

/** The caller's unblock policy -- escalate-by-default; auto-answer is opt-in. */
export interface SwarmUnblockPolicy {
  /** When `true`, an auto-answer MAY fire (still gated). Default posture: escalate. */
  readonly autoAnswer: boolean;
  /** Confidence floor for an auto-answer; defaults to {@link DEFAULT_MIN_CONFIDENCE}. */
  readonly minConfidence?: number;
}

/** Resolve a blocked pane: which pane, its shared group (if any), and the policy. */
export interface ResolveBlockedInput {
  readonly workspaceId: string;
  /** The shared fan-out group id (enables the sibling-decision source). */
  readonly taskGroup?: string;
  readonly policy: SwarmUnblockPolicy;
  readonly actor: Principal;
}

/** The truthful outcome of a resolve -- an answer was delivered, or it escalated. */
export type SwarmUnblockResult =
  | {
      readonly action: 'answered';
      readonly answer: string;
      readonly source: string;
      readonly question: string;
    }
  | {
      readonly action: 'escalated';
      readonly requestId: string;
      readonly question: string | null;
      readonly reason: string;
    };

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/**
 * Strip ANSI/VT control sequences so the question search runs on plain text. The
 * `agent.read` seam already strip-ANSIs, but this is defensive: a raw tail must
 * never leak escape bytes into the searched/recorded question. Built from unicode
 * escapes so no literal control byte lives in the source.
 */
// eslint-disable-next-line no-control-regex
const ANSI_RE = new RegExp(
  '[\\u001b\\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PRZcf-nqry=><]',
  'g'
);

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Derive the blocking QUESTION from the stripped pane tail: the last line that reads
 * like a question (ends with `?`), else the last non-empty line. Returns `null` when
 * there is no readable text at all (never fabricates a question).
 */
export function extractQuestion(rawTail: string | null): string | null {
  if (rawTail == null) return null;
  const lines = stripAnsi(rawTail)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  if (lines.length === 0) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].endsWith('?')) return lines[i];
  }
  return lines[lines.length - 1];
}

/** True when a candidate is high-confidence, low-risk, AND carries real evidence. */
function isAutoAnswerable(
  candidate: UnblockCandidate,
  minConfidence: number
): boolean {
  return (
    candidate.risk === 'low' &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= minConfidence &&
    candidate.evidence.trim().length > 0
  );
}

/**
 * Resolve a Blocked Loom pane from Recoder-only sources -- escalate by default,
 * auto-answer only under an explicit, gated policy. See the class HONESTY INVARIANTS.
 */
export class SwarmUnblockService {
  private readonly deps: SwarmUnblockDeps;
  private readonly logger: LoggerPort;

  constructor(deps: SwarmUnblockDeps) {
    this.deps = deps;
    this.logger = deps.logger ?? NOOP_LOGGER;
  }

  async resolveBlocked(
    input: ResolveBlockedInput
  ): Promise<SwarmUnblockResult> {
    const { workspaceId, taskGroup, actor } = input;

    // (1) READ the blocking question from the pane tail (strip-ANSI). A pane with no
    // readable question cannot be auto-answered -- escalate truthfully.
    const rawTail = await this.deps.agentRead.readRecent(workspaceId, actor);
    const question = extractQuestion(rawTail);
    if (question == null) {
      return this.escalate(
        input,
        null,
        null,
        'could not read the blocking question from the pane'
      );
    }

    // (2) GATHER candidate answers from the Recoder-only sources.
    const candidates = await this.gatherCandidates(input, question);
    const best = chooseBest(candidates);

    // (3) DECIDE -- default = ESCALATE. Auto-answer is a narrow, gated exception.
    const minConfidence = input.policy.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    if (input.policy.autoAnswer !== true) {
      return this.escalate(
        input,
        question,
        best,
        'auto-answer disabled by policy (escalate by default)'
      );
    }
    if (best == null) {
      return this.escalate(
        input,
        question,
        null,
        'no candidate answer found in memory or sibling panes'
      );
    }
    if (!isAutoAnswerable(best, minConfidence)) {
      return this.escalate(
        input,
        question,
        best,
        'no high-confidence, low-risk, evidenced answer available'
      );
    }

    // Deterministic policy gate -- an `allow` is REQUIRED to auto-answer; anything
    // else escalates (never answers past a gate that did not allow it).
    const decision = await this.deps.policyGate.evaluate({
      workspaceId,
      question,
      candidate: best,
      actor,
    });
    if (decision.effect !== 'allow') {
      return this.escalate(
        input,
        question,
        best,
        `policy verdict '${decision.effect}' -- not auto-answering`
      );
    }

    // (4) ANSWER: deliver into the live pane, then record the EVIDENCED memory
    // candidate (best-effort -- a candidate fault never un-delivers the answer).
    await this.deps.agentPrompt.deliver({
      workspaceId,
      text: best.answer,
      actor,
    });
    await this.recordCandidate(input, question, best);
    this.logger.info('swarm unblock auto-answered a blocked pane', {
      workspaceId,
      taskGroup,
      source: best.source,
    });
    return {
      action: 'answered',
      answer: best.answer,
      source: best.source,
      question,
    };
  }

  /** Gather candidates from memory + (when grouped) a sibling that already decided. */
  private async gatherCandidates(
    input: ResolveBlockedInput,
    question: string
  ): Promise<UnblockCandidate[]> {
    const { workspaceId, taskGroup, actor } = input;
    const candidates: UnblockCandidate[] = [];

    let sibling: UnblockCandidate | null = null;
    if (taskGroup != null && taskGroup !== '') {
      try {
        sibling = await this.deps.siblingDecision.find({
          taskGroup,
          workspaceId,
          question,
          actor,
        });
      } catch (err) {
        this.logger.warn('swarm unblock sibling lookup faulted', {
          workspaceId,
          err: message(err),
        });
      }
    }
    if (sibling != null) candidates.push(sibling);

    try {
      const found = await this.deps.memorySearch.search(question, actor);
      candidates.push(...found);
    } catch (err) {
      this.logger.warn('swarm unblock memory search faulted', {
        workspaceId,
        err: message(err),
      });
    }
    return candidates;
  }

  /** Record the delivered answer as an evidenced memory candidate (best-effort). */
  private async recordCandidate(
    input: ResolveBlockedInput,
    question: string,
    candidate: UnblockCandidate
  ): Promise<void> {
    try {
      await this.deps.rememberCandidate.remember({
        workspaceId: input.workspaceId,
        taskGroup: input.taskGroup,
        question,
        answer: candidate.answer,
        source: candidate.source,
        evidence: candidate.evidence,
        actor: input.actor,
      });
    } catch (err) {
      // The answer is already delivered; a candidate-store fault is logged, never
      // faked as success and never rolled back.
      this.logger.warn('swarm unblock memory candidate not recorded', {
        workspaceId: input.workspaceId,
        err: message(err),
      });
    }
  }

  /** Open an approval request and return the truthful escalated outcome. */
  private async escalate(
    input: ResolveBlockedInput,
    question: string | null,
    candidate: UnblockCandidate | null,
    reason: string
  ): Promise<SwarmUnblockResult> {
    const { requestId } = await this.deps.approvalGate.request({
      workspaceId: input.workspaceId,
      question,
      candidate,
      reason,
      taskGroup: input.taskGroup,
      actor: input.actor,
    });
    this.logger.info('swarm unblock escalated a blocked pane', {
      workspaceId: input.workspaceId,
      taskGroup: input.taskGroup,
      requestId,
      reason,
    });
    return { action: 'escalated', requestId, question, reason };
  }
}

/** Pick the highest-confidence candidate (ties keep the earlier, sibling-first entry). */
function chooseBest(
  candidates: readonly UnblockCandidate[]
): UnblockCandidate | null {
  let best: UnblockCandidate | null = null;
  for (const candidate of candidates) {
    if (best == null || candidate.confidence > best.confidence) {
      best = candidate;
    }
  }
  return best;
}
