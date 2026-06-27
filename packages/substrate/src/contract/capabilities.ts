/**
 * SubstrateCapabilities — what a substrate can structurally do.
 *
 * New in the package (design §4.1): lets callers branch on supportsPty / remote
 * without sniffing the substrate id. Reported via ConductorSubstrate.capabilities().
 */
export interface SubstrateCapabilities {
  /** Runs in a remote sandbox (daytona) vs on the local host (tmux_worktree). */
  remote: boolean;
  /** A real PTY is available for the launched agent (tmux pane / sandbox pty). */
  supportsPty: boolean;
  /** Live keystrokes can be injected (tmux send-keys / sandbox pty input). */
  supportsInteractiveKeys: boolean;
  /** Output is captured by polling capture() rather than streamed. */
  capturesByPolling: boolean;
  /** A reviewable git diff can be produced from inside the isolation. */
  supportsDiff: boolean;
  /** Isolation (worktree / sandbox) can be removed on teardown. */
  supportsIsolationRemoval: boolean;
}
