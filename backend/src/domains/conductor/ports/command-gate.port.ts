/**
 * CommandGatePort — the per-command content seam `steerWorkspace` consults
 * BEFORE a human- or agent-authored command string is delivered into a live
 * raw-PTY session (Loom pane / tmux send-keys).
 *
 * This is NARROWER than {@link GovernanceGatePort}: `guardConductorWrite`
 * already gates the coarse `workspace.steer` MUTATION (is this principal
 * allowed to steer THIS workspace at all) before `steerWorkspace` ever calls
 * this port — see `module/governed-writes.ts`. That coarse gate's `target`
 * is `{workspace, workspaceId}` metadata; it never inspects the literal text
 * being steered. `CommandGatePort` is the thing that DOES look at the literal
 * command content (risk-tier classification, approval-gated for risky
 * commands) — it is the backend's own
 * `packages/governance` `CommandGate` wired behind a port, so the conductor
 * domain never imports `@recoder/governance` directly (same boundary
 * `GovernanceGatePort` already enforces for the coarse gate).
 *
 * Coverage: this closes the one command surface the conductor's existing ACP
 * tool-call gate does NOT cover — ACP only gates an agent's own structured
 * tool calls, not literal text a human (or an agent) submits directly into a
 * raw terminal pane via `steerWorkspace`. See plans/recoder.md "Remaining,
 * precisely scoped" (2026-10-14, lane 2) for the exact gap this fills.
 *
 * Semantics (same fail-closed contract as the package's `CommandGate`):
 *  - `allowed:false` on `deny` AND on an unresolved/rejected `needs_approval`
 *    (no approval channel configured ⇒ fail-closed deny, never a silent hang
 *    or a silent allow).
 *  - `deliver()` runs ONLY after an `allow` (or an approved `needs_approval`)
 *    verdict; its outcome (resolve/throw) is sealed into the durable audit
 *    log same as every other branch.
 *  - Every decision — allow, deny, needs_approval → approved/rejected — is
 *    appended to the durable, hash-chained audit log before this call
 *    returns, independent of whether `deliver()` ever ran.
 */
export interface CommandGateRequest {
  /** The principal/agent id this command is attributed to in the audit log. */
  readonly actorId: string;
  /** The literal command/steer text being evaluated — never a summary. */
  readonly command: string;
  /** Correlates the decision + audit entries to the originating task/run. */
  readonly taskId?: string;
  /** Free-form context merged into the governance request (e.g. workspaceId). */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * Performs the actual delivery (e.g. the Loom `agent.prompt` /
   * `pane.send_text` call) — invoked ONLY once the gate allows. A thrown
   * error here is captured as the gate's own `execution_failed` outcome and
   * still reaches the audit log; it is rethrown to the caller afterward so
   * `steerWorkspace`'s existing try/catch surfaces it exactly as before.
   */
  readonly deliver: () => Promise<void>;
}

export interface CommandGateOutcome {
  readonly allowed: boolean;
  readonly reason: string;
  readonly tier?: string;
}

/** Live command-content gate over a raw-PTY delivery. Absent ⇒ caller must refuse delivery, never silently bypass it. */
export interface CommandGatePort {
  gate(request: CommandGateRequest): Promise<CommandGateOutcome>;
}
