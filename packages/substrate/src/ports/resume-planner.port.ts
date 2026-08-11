/**
 * ResumePlannerPort — the reconciler's narrow view of the native-resume registry
 * (owned by `@recoder/runtime`, injected at the composition root).
 *
 * The reconciler must NOT depend on `@recoder/runtime` directly (layering: the
 * substrate engine is runtime-agnostic). Instead the backend wires the runtime's
 * `resumePlan`/`dedupeKey` into this port. Absent ⇒ crashed orphans finalize to
 * `failed` exactly as before (lossy, but truthful).
 */

/** The relaunch argv for a native resume. `argv[0]` is the CLI binary. */
export interface ResumePlan {
  readonly argv: string[];
}

export interface ResumePlannerPort {
  /**
   * Build the native-resume relaunch plan for a runtime + durable session ref, or
   * `null` when the runtime has no native resume or the ref fails validation. The
   * ref is carried as an argv DATA element — never shell-interpolated.
   */
  plan(runtimeId: string, sessionRef: string): ResumePlan | null;
  /**
   * Stable, collision-free key for a (runtimeId, sessionRef) pair so two workspaces
   * can never resume the SAME native session and a session is resumed at most once.
   */
  dedupeKey(runtimeId: string, sessionRef: string): string;
}
