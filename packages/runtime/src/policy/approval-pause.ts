import type { ApprovalDecision } from '../contracts/runtime-driver';
import { runtimeError } from '../errors/runtime-error';

export type ApprovalResolution = {
  approved: boolean;
  decision: ApprovalDecision;
};

/**
 * Pauses a run when an `approval` frame arrives, until `resolve()` is called by the
 * adapter's `approve()` (or the run is aborted). Fail-safe: an aborted wait rejects with
 * `approval_required` rather than silently proceeding.
 */
export class ApprovalPause {
  private readonly pending = new Map<string, PendingApproval>();

  wait(approvalId: string, signal: AbortSignal): Promise<ApprovalResolution> {
    const existing = this.pending.get(approvalId);
    if (existing) return existing.promise;

    let resolveFn!: (value: ApprovalResolution) => void;
    let rejectFn!: (reason: unknown) => void;
    const promise = new Promise<ApprovalResolution>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const onAbort = () => {
      this.pending.delete(approvalId);
      rejectFn(
        runtimeError('approval_required', `Approval "${approvalId}" aborted before a decision.`),
      );
    };

    if (signal.aborted) {
      onAbort();
      return promise;
    }
    signal.addEventListener('abort', onAbort, { once: true });

    this.pending.set(approvalId, {
      promise,
      resolve: (resolution) => {
        signal.removeEventListener('abort', onAbort);
        this.pending.delete(approvalId);
        resolveFn(resolution);
      },
    });

    return promise;
  }

  resolve(approvalId: string, decision: ApprovalDecision): boolean {
    const entry = this.pending.get(approvalId);
    if (!entry) return false;
    entry.resolve({ approved: decision.status === 'approved', decision });
    return true;
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}

type PendingApproval = {
  promise: Promise<ApprovalResolution>;
  resolve: (resolution: ApprovalResolution) => void;
};
