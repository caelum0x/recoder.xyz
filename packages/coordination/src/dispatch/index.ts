/**
 * dispatch barrel — DEPENDENCY-AWARE DISPATCH module.
 *
 * Fuses agent-os `task-routing-service` (route/candidate/permission/policy),
 * A2A `capability-matcher` + `multi-dispatch` + `task-result-aggregator`
 * (capability scoring, orchestration patterns, result aggregation), and
 * multica's claim-recovery + squad leader/no-action semantics (claim
 * coordinator, duplicate guard, squad dispatch).
 */

// ── routing + scoring ────────────────────────────────────────────────────────
export * from './routing-request';
export * from './space-policy-filter';
export * from './permission-filter';
export * from './health-filter';
export * from './capability-matcher';
export * from './candidate-scorer';
export * from './routing-service';

// ── dependency-aware dispatch ────────────────────────────────────────────────
export * from './dependency-resolver';
export * from './dependency-graph-walker';
export * from './ready-set';

// ── claims (anti-duplicate-work) ─────────────────────────────────────────────
export * from './claim-coordinator';
export * from './duplicate-guard';

// ── squads ───────────────────────────────────────────────────────────────────
export * from './squad-leader-policy';
export * from './squad-dispatch';

// ── orchestration patterns + aggregation ─────────────────────────────────────
export * from './orchestration';

// ── pure planner + impure manager ────────────────────────────────────────────
export * from './dispatch-planner';
export * from './dispatch-manager';
