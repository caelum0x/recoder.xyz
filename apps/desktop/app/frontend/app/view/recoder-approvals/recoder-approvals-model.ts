// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { decideApproval } from "../recoder/recoder-approval-action";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readFetchError } from "../recoder/recoder-errors";
import { RecoderApprovalsView } from "./recoder-approvals";

// Mirrors the governance ApprovalRecord actually served at /api/agent-os/approvals
// (backend/src/domains/governance/types.ts) — the governance router shadows the
// agent-os one for these paths. Only the fields the terminal renders/acts on are declared.
type RecoderApproval = {
    id: string;
    taskId?: string;
    runId?: string;
    action: string;
    riskTier: "low" | "medium" | "high" | "critical";
    status: "pending" | "approved" | "denied" | "expired";
    requestedBy: string;
    reason?: string;
    createdAt: string;
};

class RecoderApprovalsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    approvalsAtom: PrimitiveAtom<RecoderApproval[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    connectedAtom: PrimitiveAtom<boolean>;
    actingAtom: PrimitiveAtom<string>;
    actionErrorAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-approvals";
        this.viewIcon = atom("shield-halved");
        this.viewName = atom("Approvals");
        this.approvalsAtom = atom([]) as PrimitiveAtom<RecoderApproval[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
        this.actingAtom = atom("") as PrimitiveAtom<string>;
        this.actionErrorAtom = atom("") as PrimitiveAtom<string>;
    }

    get viewComponent(): ViewComponent {
        return RecoderApprovalsView;
    }

    // Degrade-safe: any transport failure leaves connected=false so the panel
    // shows a neutral "not connected" message rather than crashing or faking data.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        globalStore.set(this.actionErrorAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/approvals`);
            if (!res.ok) {
                globalStore.set(this.connectedAtom, false);
                RecoderConnectionModel.getInstance().noteRefresh(false);
                const detail = await readFetchError(res);
                globalStore.set(this.errorAtom, detail || `Approvals unavailable (${res.status})`);
                return;
            }
            const body = await res.json();
            const data = body?.data;
            const list = Array.isArray(data?.approvals)
                ? (data.approvals as RecoderApproval[])
                : Array.isArray(data)
                  ? (data as RecoderApproval[])
                  : [];
            const pending = list.filter((a) => a?.status == "pending");
            globalStore.set(this.approvalsAtom, pending);
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
            globalStore.set(this.approvalsAtom, []);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    async decide(approvalId: string, action: "approve" | "reject") {
        globalStore.set(this.actingAtom, approvalId);
        globalStore.set(this.actionErrorAtom, "");
        const result = await decideApproval(approvalId, action);
        globalStore.set(this.actingAtom, "");
        if (!result.ok) {
            globalStore.set(this.actionErrorAtom, result.error);
            return;
        }
        await this.refresh();
    }
}

export { RecoderApprovalsViewModel, type RecoderApproval };
