// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The single source of truth for the approval-decision contract, shared by the
// Approvals side-list and the inline run-stream affordance so both POST the exact
// same shape. The backend resolves the decider from the authenticated principal;
// an identity in the body would never be trusted, so none is sent.

import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readFetchError } from "./recoder-errors";

type ApprovalAction = "approve" | "reject";

type ApprovalDecisionResult = { ok: boolean; error?: string };

function approvalDecideUrl(baseUrl: string, approvalId: string): string {
    return `${baseUrl}/api/agent-os/approvals/${encodeURIComponent(approvalId)}/decide`;
}

// approve → "approved", reject → "denied": the governance decision vocabulary.
function approvalDecisionPayload(action: ApprovalAction): { decision: "approved" | "denied" } {
    return { decision: action == "approve" ? "approved" : "denied" };
}

// Degrade-truthful: every failure returns a readable reason; a decision is never
// reported as succeeded unless the backend returned ok.
async function decideApproval(approvalId: string, action: ApprovalAction): Promise<ApprovalDecisionResult> {
    if (approvalId == "") return { ok: false, error: "missing approval id" };
    try {
        const res = await fetch(approvalDecideUrl(getRecoderBackendUrl(), approvalId), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(approvalDecisionPayload(action)),
        });
        if (!res.ok) {
            const detail = await readFetchError(res);
            return { ok: false, error: detail || `Could not ${action} (${res.status})` };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

export {
    approvalDecideUrl,
    approvalDecisionPayload,
    decideApproval,
    type ApprovalAction,
    type ApprovalDecisionResult,
};
