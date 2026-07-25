// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readFetchError } from "../recoder/recoder-errors";
import { RecoderApprovalsView } from "./recoder-approvals";

// Mirrors the Agent OS Approval domain type (packages/agent-os/src/domain/approval.ts).
// Only the fields the terminal renders/acts on are declared.
type RecoderApproval = {
    approvalId: string;
    taskId: string;
    runId?: string;
    status: "pending" | "approved" | "rejected" | "expired" | "escalated";
    reason: string;
    requestedBy: string;
    requestedAt: string;
    requiredAt: string;
    target?: {
        path?: string;
        command?: string;
        toolName?: string;
    };
};

// The decider identity attached to approve/reject actions from the terminal.
const TerminalDecider = "recoder-terminal";

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
                const detail = await readFetchError(res);
                globalStore.set(this.errorAtom, detail || `Approvals unavailable (${res.status})`);
                return;
            }
            const body = await res.json();
            const list = Array.isArray(body?.data) ? (body.data as RecoderApproval[]) : [];
            const pending = list.filter((a) => a?.status === "pending" || a?.status === "escalated");
            globalStore.set(this.approvalsAtom, pending);
            globalStore.set(this.connectedAtom, true);
        } catch {
            globalStore.set(this.connectedAtom, false);
            globalStore.set(this.approvalsAtom, []);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    async decide(approvalId: string, action: "approve" | "reject") {
        globalStore.set(this.actingAtom, approvalId);
        globalStore.set(this.actionErrorAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/approvals/${approvalId}/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decidedBy: TerminalDecider }),
            });
            if (!res.ok) {
                const detail = await readFetchError(res);
                globalStore.set(this.actionErrorAtom, detail || `Could not ${action} (${res.status})`);
                return;
            }
        } catch (e) {
            globalStore.set(this.actionErrorAtom, e instanceof Error ? e.message : String(e));
            return;
        } finally {
            globalStore.set(this.actingAtom, "");
        }
        await this.refresh();
    }
}

export { RecoderApprovalsViewModel, type RecoderApproval };
