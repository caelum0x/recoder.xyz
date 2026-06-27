/**
 * Liveness — whether a launched agent is still running, and (when known) how it
 * finished. The local substrate can upgrade `alive` to a true exit code via
 * tmux `#{pane_dead_status}`; the remote substrate reads the `.recoder/agent.exit`
 * marker (design §4.3 / §4.4).
 */
export type LivenessSource = 'tmux_pane' | 'exit_marker' | 'session' | 'unknown';

export interface Liveness {
  alive: boolean;
  /** True exit code when the substrate can determine it. */
  exitCode?: number;
  /** ISO-8601 timestamp the agent finished (when alive=false and known). */
  finishedAt?: string;
  source: LivenessSource;
}
