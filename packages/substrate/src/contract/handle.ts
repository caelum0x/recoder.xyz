/**
 * SubstrateHandle — the opaque, restart-survivable reference to launched work.
 *
 * Promoted verbatim from docker-backend/src/conductor/substrate.ts. A handle is
 * intentionally re-derivable from persisted Workspace fields (sessionName /
 * worktreePath / sandboxId), so the substrate can re-find live work after a
 * backend restart without an in-memory map.
 */
export interface SubstrateHandle {
  /** Substrate-specific handle id (e.g. tmux session name or sandbox id). */
  ref: string;
  worktreePath?: string;
  sessionName?: string;
  /** Remote sandbox id (daytona substrate). */
  sandboxId?: string;
}
