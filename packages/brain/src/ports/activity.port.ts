import type {
  BrainActivity,
  BrainActivityProfile,
} from "../domain/activity.types";

/** A grounded answer about the user's activity: an optional synthesized answer + its evidence rows. */
export interface BrainActivityAnswer {
  /** Synthesized answer when an LLM is configured; null otherwise (heuristic/evidence-only mode). */
  answer: string | null;
  /** The attributed activity rows that ground the answer (always real, even without an LLM). */
  sources: BrainActivity[];
}

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
  /**
   * Grounded Q&A over activity: evidence rows (always) + a synthesized answer when an LLM is
   * wired. Backed by continuum's answerQuery (KG facts + recall). Optional (R2).
   */
  answer?(query: string, limit?: number): Promise<BrainActivityAnswer>;
}
