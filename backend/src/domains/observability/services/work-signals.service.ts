/**
 * `WorkSignalsService` — pulls raw signals from the {@link WorkSignalsPort}
 * (ops-recorder sidecar), normalizes each to a Recoder `RunEvent`, emits them to
 * the RunEvent bus + board, and records the human disposition of a signal (a
 * governance-gated write).
 *
 * TRUTHFULNESS: when the sidecar is `down`, `refresh()` returns an empty batch and
 * marks itself `degraded` — it NEVER fabricates a signal. A disposition write
 * passes the governance gate (`decide` → `recordAudit`); a denied/degraded gate
 * blocks the write rather than silently recording it.
 */
import { randomUUID } from 'node:crypto';
import type { RunEvent } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { Principal } from '../../identity/types.js';
import type { RawWorkSignal, WorkSignalsPort } from '../ports/signals.port.js';
import type { OpsRecorderSyncResult } from '../ports/ops-recorder-push.port.js';
import type { SignalDispositionRepository } from '../ports/observability.repository.js';
import type {
  DispositionState,
  SignalDisposition,
  WorkSignal,
  WorkSignalKind,
} from '../types.js';

/** The RunEvent sink the normalized signals are emitted onto (agent-os bus). */
export interface RunEventEmitter {
  ingest(event: RunEvent, source: string): Promise<void> | void;
}

/** The board/notify seam (herd) a needs-you signal is surfaced through. */
export interface SignalBoard {
  notify(signal: WorkSignal): Promise<void> | void;
}

export interface WorkSignalsServiceDeps {
  readonly logger: Logger;
  readonly port: WorkSignalsPort;
  readonly gate: GovernanceGate;
  readonly repository: SignalDispositionRepository;
  /** Optional RunEvent bus — normalized signals ingest here. */
  readonly runEvents?: RunEventEmitter;
  /** Optional board — needs-you signals are surfaced here. */
  readonly board?: SignalBoard;
  readonly defaultSpaceId: string;
}

/** Map a raw sidecar `detected_reason`/`item_type` to a work-signal kind. */
export function classifyKind(raw: RawWorkSignal): WorkSignalKind {
  const reason = (raw.detected_reason ?? '').toLowerCase();
  if (reason.includes('review') || reason.includes('needs') || reason.includes('assign')) {
    return 'needs-you';
  }
  if (reason.includes('block') || reason.includes('conflict') || reason.includes('fail')) {
    return 'blocked';
  }
  return 'stuck';
}

/** Correlate a raw signal to a Recoder run id, when it encodes one. */
function runIdOf(raw: RawWorkSignal): string | null {
  const match = /run[_-]([a-z0-9-]+)/i.exec(raw.source_url ?? '');
  return match ? `run_${match[1]}` : null;
}

/** Normalize a raw sidecar signal into the domain {@link WorkSignal}. */
export function normalizeSignal(raw: RawWorkSignal): WorkSignal {
  const priority = raw.priority === 'high' || raw.priority === 'low' ? raw.priority : 'medium';
  return {
    id: raw.id,
    kind: classifyKind(raw),
    title: raw.title,
    sourceUrl: raw.source_url,
    reason: raw.detected_reason,
    priority,
    runId: runIdOf(raw),
    handoffPrompt: raw.agent_handoff_prompt ?? '',
    detectedAt: raw.detected_at ?? new Date().toISOString(),
  };
}

/** Normalize a work signal into a Recoder `RunEvent` (`needs_input` type). */
export function toRunEvent(signal: WorkSignal): RunEvent {
  return {
    eventId: `event_${randomUUID()}`,
    type: 'needs_input',
    taskId: signal.runId ? signal.runId.replace(/^run_/, '') : signal.id,
    ...(signal.runId ? { runId: signal.runId } : {}),
    message: `${signal.kind}: ${signal.title} — ${signal.reason}`,
    createdAt: new Date().toISOString(),
    data: {
      source: 'ops-recorder',
      kind: signal.kind,
      priority: signal.priority,
      sourceUrl: signal.sourceUrl,
      handoffPrompt: signal.handoffPrompt,
    },
  };
}

export interface RefreshResult {
  readonly signals: readonly WorkSignal[];
  /** True when the sidecar was unavailable (empty batch is truthful, not a bug). */
  readonly degraded: boolean;
  readonly reason?: string;
}

export interface ScanResult extends RefreshResult {
  /** Per-detector trigger outcome — a down sidecar reports `triggered:false`. */
  readonly triggered: {
    readonly github: OpsRecorderSyncResult;
    readonly linear: OpsRecorderSyncResult;
  };
}

export class WorkSignalsService {
  constructor(private readonly deps: WorkSignalsServiceDeps) {}

  /**
   * Pull the current signals, normalize + emit them. When the sidecar is down the
   * result is an EMPTY, `degraded:true` batch — never fabricated signals.
   */
  async refresh(): Promise<RefreshResult> {
    const availability = await this.deps.port.availability();
    if (availability.status === 'down') {
      return { signals: [], degraded: true, ...(availability.reason ? { reason: availability.reason } : {}) };
    }

    const raw = await this.deps.port.fetchSignals();
    const signals = raw.map(normalizeSignal);

    for (const signal of signals) {
      try {
        if (this.deps.runEvents) await this.deps.runEvents.ingest(toRunEvent(signal), 'ops-recorder');
        if (this.deps.board && signal.kind === 'needs-you') await this.deps.board.notify(signal);
      } catch (err) {
        this.deps.logger.warn(
          { err: err instanceof Error ? err.message : String(err), signalId: signal.id },
          'failed to emit work signal',
        );
      }
    }

    return { signals, degraded: availability.status === 'degraded' };
  }

  /**
   * On-demand SCAN: trigger the sidecar's GitHub + Linear detectors NOW (in
   * parallel) so an agent can proactively surface stuck/blocked/needs-you work
   * instead of waiting for the sidecar's own cadence, then return the refreshed
   * signals. Truthful: a down/unreachable sidecar yields `triggered:false` per
   * source and an empty, `degraded:true` refresh — never a faked scan.
   */
  async scan(): Promise<ScanResult> {
    const [github, linear] = await Promise.all([
      this.deps.port.syncGithub(),
      this.deps.port.syncLinear(),
    ]);
    const refresh = await this.refresh();
    return {
      ...refresh,
      degraded: refresh.degraded || github.degraded || linear.degraded,
      triggered: { github, linear },
    };
  }

  /** List the recorded dispositions (space-scoped). */
  async listDispositions(spaceId?: string): Promise<readonly SignalDisposition[]> {
    return this.deps.repository.list(spaceId ?? this.deps.defaultSpaceId);
  }

  /**
   * Record a human disposition on a work signal. GOVERNANCE-GATED: the write only
   * lands after `gate.decide` allows it; the audit record id is stored as
   * `auditRef`. A deny (or degraded gate) blocks the write and surfaces the verdict.
   */
  async disposition(input: {
    readonly signalId: string;
    readonly disposition: DispositionState;
    readonly principal: Principal;
    readonly spaceId?: string;
  }): Promise<SignalDisposition> {
    const spaceId = input.spaceId ?? this.deps.defaultSpaceId;
    const verdict = await this.deps.gate.decide('signal.disposition', input.principal, {
      target: { path: `work-signal:${input.signalId}` },
      metadata: { disposition: input.disposition, spaceId },
    });
    if (verdict.effect !== 'allow') {
      throw new Error(`governance denied signal disposition: ${verdict.reason || 'deny'}`);
    }

    const audit = await this.deps.gate.recordAudit({
      actorId: input.principal.userId,
      action: 'signal.disposition',
      resource: `work-signal:${input.signalId}`,
      effect: 'allow',
      riskTier: 'low',
      degraded: verdict.degraded,
      payload: { disposition: input.disposition, spaceId },
    });

    const existing = await this.deps.repository.getBySignal(input.signalId);
    const now = new Date().toISOString();
    if (existing) {
      const updated = await this.deps.repository.setDisposition(input.signalId, {
        disposition: input.disposition,
        decidedBy: input.principal.userId,
        decidedAt: now,
        auditRef: audit.id,
      });
      if (updated) return updated;
    }

    return this.deps.repository.upsert({
      id: `wsd_${randomUUID()}`,
      signalId: input.signalId,
      spaceId,
      runId: null,
      kind: 'stuck',
      disposition: input.disposition,
      decidedBy: input.principal.userId,
      decidedAt: now,
      auditRef: audit.id,
      createdAt: now,
    });
  }
}
