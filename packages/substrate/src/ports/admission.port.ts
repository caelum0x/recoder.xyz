/**
 * AdmissionPort — the resource-governor seam (design §4.8 / §7).
 *
 * Before launching a workspace the engine asks the resource governor whether a
 * new workspace can be admitted under the current parallelism / disk / session
 * budget. A refusal short-circuits the engine to `failed` with the truthful
 * reason — it never silently over-admits and exhausts the host.
 *
 * The backend injects the `resource-governor.admitWorkspace` adapter; tests
 * inject a fake that always admits (or refuses to exercise the reject path).
 * Interface only.
 */
export interface AdmissionDecision {
  /** Whether the workspace may launch. */
  admitted: boolean;
  /** Truthful reason when refused (surfaced in the failed-workspace metadata). */
  reason?: string;
  /** Current resource counters at decision time (for the failure metadata / audit). */
  current?: Record<string, unknown>;
}

export interface AdmissionPort {
  /** Decide whether a new workspace can be admitted for (projectId, createdBy). */
  admit(projectId: string, createdBy: string): Promise<AdmissionDecision>;
}
