/**
 * `UsageLedgerRepository` + `DeliveryOutcomeRepository` — the durable accounting
 * + audit seams every routed call appends to. Degrade-safe: without a pool,
 * appends are best-effort no-ops and reads return empty; the seam never crashes.
 *
 * The usage ledger is the token + cost source of record the billing/metering
 * domain reads; the delivery-outcome trail records which tier served each call.
 */
import type {
  DeliveryOutcomeInput,
  DeliveryOutcomeRecord,
  UsageLedgerInput,
  UsageLedgerRecord,
} from '../types.js';

export interface UsageLedgerRepository {
  /** Append one usage row (token counts + computed micro-USD cost). */
  append(input: UsageLedgerInput): Promise<UsageLedgerRecord | null>;
  /** Recent usage rows for a user (most-recent-first, bounded). */
  recentForUser(userId: string, limit?: number): Promise<readonly UsageLedgerRecord[]>;
  /**
   * True IFF a ledger row exists for `inferenceId` attributed to `userId` — i.e.
   * this caller produced this inference. The cross-tenant feedback ownership guard
   * consults this before dispatching a signal to the gateway. Degrade-safe: when
   * the durable backing is unavailable (or the read errors) it returns FALSE, so
   * ownership fails CLOSED (a fault is never a feedback-poisoning oracle).
   */
  ownsInference(userId: string, inferenceId: string): Promise<boolean>;
  /**
   * Aggregate token + cost totals for a user over an optional lookback window.
   * Returns zeros when no rows / no pool.
   */
  totalsForUser(
    userId: string,
    sinceIso?: string,
  ): Promise<{
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly costMicroUsd: number;
    readonly calls: number;
  }>;
  /** True when the durable backing is available. */
  isDurable(): boolean;
}

export interface DeliveryOutcomeRepository {
  /** Append one delivery-outcome audit row. */
  append(input: DeliveryOutcomeInput): Promise<DeliveryOutcomeRecord | null>;
  /** Recent delivery outcomes for a user (most-recent-first, bounded). */
  recentForUser(userId: string, limit?: number): Promise<readonly DeliveryOutcomeRecord[]>;
  /** True when the durable backing is available. */
  isDurable(): boolean;
}
