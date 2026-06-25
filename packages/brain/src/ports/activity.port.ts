import type {
  BrainActivity,
  BrainActivityProfile,
} from "../domain/activity.types";

/**
 * Desktop-activity recall, bound to the owned continuum (ts/continuum).
 *
 * This is the seam continuum implements: recall is semantic activity search,
 * profile is the synthesized "who is this user / how they work" view. The core
 * depends only on this contract, never the continuum CLI itself.
 */
export interface ActivityPort {
  recall(query: string, limit: number): Promise<BrainActivity[]>;
  profile(topic?: string): Promise<BrainActivityProfile | null>;
}
