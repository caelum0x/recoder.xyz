/**
 * `ConductorPlanPort` — the conductor-owned seam over the engines pal
 * `planLaunch` verb (docs/modules/communication.md). On a workspace launch the
 * composer OPTIONALLY consults this port for pal's advisory launch plan
 * (runtime/skill/tool-grant/sandbox tier + governed risk) BEFORE it selects the
 * substrate. The port is deliberately OPTIONAL on {@link ConductorModuleDeps}:
 * absent ⇒ the launch path is byte-identical to today (single-writer safe).
 *
 * The CALLER's explicit choices ALWAYS win — pal only fills gaps the operator
 * left blank, and `risk`/`approvalRequired` are recorded on the launch audit as
 * advisory metadata (pal advises, the governance kernel still decides). The
 * conductor domain re-declares pal's `risk` union LOCALLY (a byte-identical copy
 * of `@recoder/pal`'s `RiskLevel`), so this domain takes NO `@recoder/pal`
 * import; the engines-owned facet's pal-typed strings assign structurally to
 * this local union at the adapter boundary.
 */

/** The loose launch spec the pal facet normalizes (a full agent-os TaskSpec wins). */
export interface ConductorPlanInput {
  readonly taskId?: string;
  readonly intent?: string;
  readonly title?: string;
  readonly goal?: string;
  readonly taskSpec?: unknown;
}

/** Pal's advisory launch plan. `source:'default'` ⇒ pal declined (no override). */
export interface ConductorPlanDecision {
  /** Conductor-local mirror of pal's `RiskLevel` — no `@recoder/pal` import. */
  readonly risk: 'low' | 'medium' | 'high';
  readonly approvalRequired: boolean;
  /** Advisory runtime — consumed ONLY when the caller pinned none. */
  readonly runtimeId?: string;
  /** Advisory sandbox tier — recorded as launch metadata. */
  readonly sandboxTier?: string;
  readonly skills: readonly string[];
  readonly toolGrants: readonly string[];
  readonly source: 'pal' | 'default';
  readonly reason: string;
}

/** The conductor's narrow view of the pal launch-planning brain (never throws). */
export interface ConductorPlanPort {
  plan(input: ConductorPlanInput): ConductorPlanDecision;
}
