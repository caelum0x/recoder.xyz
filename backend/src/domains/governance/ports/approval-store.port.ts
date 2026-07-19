/**
 * `ApprovalStorePort` — the seam over the Rust kernel's own `ApprovalManager`
 * (the in-proc approval gate embedded in `recoder-governance-napi`'s
 * `NapiGovernanceKernel`: `submit_approval` / `resolve_approval` /
 * `list_pending_approvals` / `pending_approval_count` + `reload_policies`).
 *
 * This is DELIBERATELY the live in-kernel gate — NOT the durable Postgres
 * `ApprovalRepository`. The gate service prefers it to clear a `needs_approval`
 * verdict so the SAME kernel that ran `decide()` is the one that saw the approval,
 * and falls back to the durable repo (the "shadow store") when the native kernel
 * is absent.
 *
 * DEGRADE-TRUTHFUL: when the `recoder-governance-napi` addon is not loadable for
 * this arch/platform, `available` is `false` and every op returns a truthful
 * "store unavailable" result — never a fabricated approval, never a thrown seam.
 */

/** A submitted approval request (mirrors the kernel's `ApprovalRequest`). */
export interface ApprovalSubmitInput {
  /** Unique request id (caller-chosen; correlates submit ↔ resolve ↔ clearance). */
  readonly id: string;
  /** The requesting agent id. */
  readonly agentId: string;
  /** The tool/action requiring approval. */
  readonly toolName: string;
  /** Human-readable description of what will happen. */
  readonly description: string;
  /** Short summary of the action. */
  readonly actionSummary: string;
  /** Inherent risk level of the action. */
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Timeout before the pending request auto-expires (seconds). */
  readonly timeoutSecs: number;
  /** The task this approval belongs to (clearance correlation). */
  readonly taskId?: string | null;
  /** The dotted governance action this approval clears (clearance correlation). */
  readonly action?: string | null;
}

/** The outcome of submitting an approval request to the kernel gate. */
export interface ApprovalSubmitResult {
  /** `approved`/`denied` when the kernel auto-decided; `pending` when it waits for a human. */
  readonly outcome: 'approved' | 'denied' | 'pending';
  /** The request id the kernel tracks the pending decision under. */
  readonly requestId: string;
  /** True only when the native kernel store actually answered (never faked). */
  readonly stored: boolean;
  /** Truthful reason when the store is unavailable / degraded. */
  readonly reason?: string;
}

/** The result of resolving a pending approval on the kernel gate. */
export interface ApprovalResolveResult {
  readonly requestId: string;
  readonly decision: 'approved' | 'denied';
  /** True only when the native kernel store actually resolved it (never faked). */
  readonly stored: boolean;
  readonly reason?: string;
}

/** A pending approval as the kernel currently holds it. */
export interface PendingApproval {
  readonly id: string;
  readonly agentId?: string;
  readonly toolName?: string;
  readonly riskLevel?: string;
}

/** The result of a live policy hot-swap (`reload_policies`). */
export interface ReloadPoliciesResult {
  /** True only when the native kernel accepted and swapped the policy bundle. */
  readonly reloaded: boolean;
  /** Truthful reason when the store is unavailable or the config was rejected. */
  readonly reason?: string;
}

/**
 * The kernel-backed approval store. All ops are async so a future
 * daemon-transport binding can satisfy the same seam; the native rung answers
 * synchronously under the hood.
 */
export interface ApprovalStorePort {
  /** Whether the native kernel approval store is actually live (truthful). */
  readonly available: boolean;

  /** Submit an approval request into the kernel's own approval gate. */
  submit(input: ApprovalSubmitInput): Promise<ApprovalSubmitResult>;

  /** Resolve a pending approval on the kernel gate with a human decision. */
  resolve(
    requestId: string,
    decision: 'approved' | 'denied',
    decidedBy: string,
  ): Promise<ApprovalResolveResult>;

  /** The kernel's currently pending approval requests. */
  listPending(): Promise<readonly PendingApproval[]>;

  /** Count of pending approvals on the kernel gate. */
  count(): Promise<number>;

  /**
   * Whether a granted approval exists for this task+action — the clearance
   * evidence that flips a `needs_approval` verdict to `allow`. Returns the
   * granting request id, or `null` when nothing clears. Degrade-truthful:
   * an unavailable store returns `null` (the gate then falls back to the repo).
   */
  findApproval(taskId: string, action: string): Promise<{ readonly requestId: string } | null>;

  /**
   * Hot-swap the kernel's live policy bundle from a JSON `GovernanceKernelConfig`.
   * Fail-closed inside the kernel: a rejected config leaves the OLD policy live.
   */
  reloadPolicies(configJson: string): Promise<ReloadPoliciesResult>;
}
