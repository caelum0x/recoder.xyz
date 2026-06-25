/** A node in the durable task graph (bound to beads). */
export interface BrainTask {
  id: string;
  title: string;
  status: string;
  dependsOn?: string[];
  blocks?: string[];
}
