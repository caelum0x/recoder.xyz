/** The inputs to one Brain read. */
export interface BrainQuery {
  /** The task/prompt driving this run. */
  task: string;
  /** Absolute repo root to index. */
  repoRoot: string;
  /** Optional files the agent is focused on. */
  focusFiles?: string[];
  /** Max items per source. */
  limit?: number;
}
