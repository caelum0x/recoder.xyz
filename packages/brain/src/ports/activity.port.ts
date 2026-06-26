import type {
  BrainActivity,
  BrainActivityProfile,
} from "../domain/activity.types";

/**
 * Desktop-activity recall, bound to the OWNED continuum engine (in-process).
 *
 * This is the seam continuum implements: recall is semantic activity search,
 * profile is the synthesized "who is this user / how they work" view. The core
 * depends only on this contract, never on continuum's internals — the engine
 * behind it is fused in-process (see activity/continuum-activity-adapter.ts).
 */
export interface ActivityPort {
  /** Semantic activity search → attributed rows. */
  recall(query: string, limit: number): Promise<BrainActivity[]>;
  /** Synthesized "who is this user / how they work" view. */
  profile(topic?: string): Promise<BrainActivityProfile | null>;
  /** Recent activity, newest-first, deduped (no query needed). Optional (R1). */
  recent?(limit?: number): Promise<BrainActivity[]>;
  /** One-line "who is this user" snapshot, no LLM. Optional (R1). */
  snapshot?(): Promise<string | null>;
}
