/**
 * `McpInjectPort` — the per-worktree `.mcp.json` injection seam.
 *
 * When a workspace launches, the conductor writes a `.mcp.json` into the agent's
 * isolated worktree so the launched coding agent (Claude Code, opencode, …) points
 * its MCP client at the GOVERNED backend MCP host — the Recoder capability-tools
 * bridge (`mcp/recoder-capability-tools.cjs` via the stdio server), whose calls run
 * the `authorize → risk → execute → audit` gate server-side.
 *
 * The file is SECRET-FREE by construction: the bridge reads `INTERNAL_SERVICE_KEY`
 * from the agent's PROCESS env (the substrate injects it into the tmux/session env),
 * never from this file. The injector only writes non-secret hints (the loopback
 * `RECODER_INTERNAL_URL`, an agent id) and drops any secret-looking key.
 *
 * Degrade-safe: no worktree path ⇒ a truthful `injected:false` skip (never a
 * fabricated write); an unparseable existing `.mcp.json` is LEFT UNTOUCHED (the
 * agent's own servers are never destroyed). The adapter lives in
 * `adapters/mcp-inject.adapter.ts`; bootstrap wires it at the composition root
 * (absent ⇒ the composer skips injection truthfully).
 */

/** The outcome of one `.mcp.json` injection attempt. */
export interface McpInjectResult {
  /** Whether the worktree now carries a Recoder MCP entry (true even when unchanged). */
  readonly injected: boolean;
  /** Absolute path of the `.mcp.json` (present when a worktree was targeted). */
  readonly path?: string;
  /** True only when the file's bytes were rewritten (false on an idempotent re-run). */
  readonly changed?: boolean;
  /** The truthful reason a write was skipped (no worktree / unparseable existing file). */
  readonly reason?: string;
}

/** Injects the Recoder MCP toolbelt into a launched workspace's worktree. */
export interface McpInjectPort {
  /**
   * Write (merge-safe, idempotent, git-excluded, secret-free) the `recoder` MCP
   * server entry into `<worktreePath>/.mcp.json`. A blank/undefined worktree is a
   * truthful skip (`injected:false`), never an error.
   */
  inject(worktreePath: string | null | undefined): Promise<McpInjectResult>;
}
