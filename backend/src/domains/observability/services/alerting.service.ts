/**
 * `AlertingService` — evaluates {@link AlertRule}s against the current health/SLO/
 * metrics snapshot, dedupes + debounces firings, delivers them through the notify
 * engine / herd board, persists each {@link AlertEvent}, and acknowledges an event
 * through the GOVERNANCE GATE (an ack is a write; it passes `decide` + `recordAudit`).
 *
 * DEDUPE/DEBOUNCE: a rule that is already `firing` (an un-resolved event within its
 * `forSecs` window) is not re-fired — the board sees one live alert, not a storm.
 * DELIVERY: best-effort; a notify failure is logged and the event is still
 * persisted (so the alert is never silently lost).
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import type { GovernanceGate } from '../../governance/ports/gate.port.js';
import type { Principal } from '../../identity/types.js';
import type { AlertRepository } from '../ports/observability.repository.js';
import type { AlertEvent, AlertRule, HealthFull } from '../types.js';

/** The delivery seam (herd board / notify engine). */
export interface AlertNotifier {
  deliver(rule: AlertRule, event: AlertEvent): Promise<void> | void;
}

export interface AlertingServiceDeps {
  readonly logger: Logger;
  readonly repository: AlertRepository;
  readonly gate: GovernanceGate;
  readonly notifier?: AlertNotifier;
}

/** The snapshot alert expressions are evaluated against. */
export interface AlertEvalContext {
  readonly health: HealthFull;
}

/**
 * Evaluate a single rule's expression against the snapshot. The expression grammar
 * is intentionally tiny + safe (NO eval): supported forms are
 *   `health.status == down|degraded`
 *   `health.degraded == true`
 *   `slo:<name> < <number>`   (observed attainment below target)
 * An unrecognized expression never fires (fail-safe: an alert must be explicit).
 * Returns the triggering value (or null when not triggered).
 */
export function evaluateExpr(expr: string, ctx: AlertEvalContext): number | null {
  const e = expr.trim();

  const statusMatch = /^health\.status\s*==\s*(down|degraded|unknown)$/.exec(e);
  if (statusMatch) {
    return ctx.health.status === statusMatch[1] ? 1 : null;
  }

  if (/^health\.degraded\s*==\s*true$/.test(e)) {
    return ctx.health.degraded ? 1 : null;
  }

  const sloMatch = /^slo:([\w-]+)\s*<\s*([\d.]+)$/.exec(e);
  if (sloMatch) {
    const target = ctx.health.slo.find((s) => s.name === sloMatch[1]);
    if (!target || target.observed === null) return null;
    return target.observed < Number(sloMatch[2]) ? target.observed : null;
  }

  return null;
}

export class AlertingService {
  constructor(private readonly deps: AlertingServiceDeps) {}

  /** List a space's alert rules. */
  async listRules(spaceId: string): Promise<readonly AlertRule[]> {
    return this.deps.repository.listRules(spaceId);
  }

  /** List a space's alert events (optionally by status). */
  async listEvents(spaceId: string): Promise<readonly AlertEvent[]> {
    return this.deps.repository.listEvents(spaceId);
  }

  /**
   * Evaluate every enabled rule against the snapshot. Fires (persists + delivers)
   * newly-triggered rules; skips rules already firing (dedupe). Returns the events
   * fired THIS pass (empty when nothing new triggered).
   */
  async evaluateRules(ctx: AlertEvalContext): Promise<readonly AlertEvent[]> {
    let rules: readonly AlertRule[];
    try {
      rules = await this.deps.repository.listEnabledRules();
    } catch (err) {
      this.deps.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'alert rule load failed; skipping evaluation pass',
      );
      return [];
    }

    const fired: AlertEvent[] = [];
    for (const rule of rules) {
      const value = evaluateExpr(rule.expr, ctx);
      if (value === null) continue;

      // Dedupe: an already-firing (un-resolved) event within the window is not re-fired.
      const latest = await this.deps.repository.latestFiring(rule.id);
      if (latest && latest.status === 'firing') continue;

      const event: AlertEvent = {
        id: `alert_${randomUUID()}`,
        ruleId: rule.id,
        spaceId: rule.spaceId,
        status: 'firing',
        value,
        firedAt: new Date().toISOString(),
        ackedAt: null,
        ackedBy: null,
        resolvedAt: null,
        auditRef: null,
      };

      const persisted = await this.deps.repository.insertEvent(event);
      fired.push(persisted);

      if (this.deps.notifier) {
        try {
          await this.deps.notifier.deliver(rule, persisted);
        } catch (err) {
          this.deps.logger.warn(
            { err: err instanceof Error ? err.message : String(err), ruleId: rule.id },
            'alert delivery failed (event still persisted)',
          );
        }
      }
    }
    return fired;
  }

  /**
   * Acknowledge a firing alert. GOVERNANCE-GATED: the ack write passes `gate.decide`
   * + `recordAudit`; the audit id is stored on the event as `auditRef`. A deny
   * blocks the ack and surfaces the verdict reason.
   */
  async acknowledgeAlert(input: {
    readonly eventId: string;
    readonly principal: Principal;
  }): Promise<AlertEvent> {
    const existing = await this.deps.repository.getEvent(input.eventId);
    if (!existing) throw new Error(`alert event not found: ${input.eventId}`);

    // State-guarded + idempotent: only a FIRING alert can be acked. An already-acked
    // event returns unchanged (no re-audit, no re-write); any other state (e.g.
    // resolved) is an illegal transition. (recoder-hale)
    if (existing.status === 'acked') return existing;
    if (existing.status !== 'firing') {
      throw new Error(`alert not in a firing state (status: ${existing.status})`);
    }

    const verdict = await this.deps.gate.decide('alert.ack', input.principal, {
      target: { path: `alert:${input.eventId}` },
      metadata: { spaceId: existing.spaceId },
    });
    if (verdict.effect !== 'allow') {
      throw new Error(`governance denied alert ack: ${verdict.reason || 'deny'}`);
    }

    const audit = await this.deps.gate.recordAudit({
      actorId: input.principal.userId,
      action: 'alert.ack',
      resource: `alert:${input.eventId}`,
      effect: 'allow',
      riskTier: 'low',
      degraded: verdict.degraded,
      payload: { spaceId: existing.spaceId },
    });

    const updated = await this.deps.repository.updateEventStatus(input.eventId, {
      status: 'acked',
      ackedAt: new Date().toISOString(),
      ackedBy: input.principal.userId,
      auditRef: audit.id,
    });
    if (!updated) throw new Error(`alert event vanished during ack: ${input.eventId}`);
    return updated;
  }
}
