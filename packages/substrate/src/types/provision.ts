/**
 * ProvisionResult — the isolation a substrate created before launching the agent
 * (design §4.3 launch flow). Local: a git worktree path; remote: a sandbox id +
 * repo work dir.
 */
export interface ProvisionResult {
  /** Worktree path (local) or sandbox id (remote). */
  isolationRef: string;
  /** Working directory the agent CLI runs in. */
  workDir: string;
  /** Branch the work is committed onto. */
  branch: string;
}
