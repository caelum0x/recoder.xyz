// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The governance ApprovalRecord shape the INLINE approval cards render and act on.
// (DESIGN-REFERENCE 3B: approvals surface in-context on the diff/session stream,
// not as a separate Approvals tab.) The standalone Approvals view was retired; this
// type is retained because recoder-diff's InlineApprovalCard still imports it.
// Mirrors backend/src/domains/governance/types.ts — only the rendered/acted fields.
type RecoderApproval = {
    id: string;
    taskId?: string;
    runId?: string;
    action: string;
    riskTier: "low" | "medium" | "high" | "critical";
    status: "pending" | "approved" | "denied" | "expired";
    requestedBy: string;
    target?: string;
    reason?: string;
    createdAt: string;
};

export { type RecoderApproval };
