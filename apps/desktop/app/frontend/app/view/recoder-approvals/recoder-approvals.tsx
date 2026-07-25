// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderApproval, RecoderApprovalsViewModel } from "./recoder-approvals-model";

const REFRESH_MS = 6000;

const REQUIRED_AT_LABELS: Record<string, string> = {
    before_execution: "before execution",
    before_write: "before write",
    before_push: "before push",
    before_pr: "before PR",
    before_sensitive_action: "before sensitive action",
    after_verification: "after verification",
    custom: "custom gate",
};

function riskLabel(a: RecoderApproval): string {
    return REQUIRED_AT_LABELS[a.requiredAt] ?? a.requiredAt ?? "gate";
}

function targetLabel(a: RecoderApproval): string {
    const t = a.target;
    if (!t) {
        return "";
    }
    if (t.command) {
        return t.command;
    }
    if (t.path) {
        return t.path;
    }
    if (t.toolName) {
        return t.toolName;
    }
    return "";
}

function RecoderApprovalsView({ model }: ViewComponentProps<RecoderApprovalsViewModel>) {
    const approvals = useAtomValue(model.approvalsAtom);
    const loading = useAtomValue(model.loadingAtom);
    const error = useAtomValue(model.errorAtom);
    const connected = useAtomValue(model.connectedAtom);
    const acting = useAtomValue(model.actingAtom);
    const actionError = useAtomValue(model.actionErrorAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showEmpty = connected && !loading && approvals.length == 0;
    const showDisconnected = !connected && !loading && error == "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Recoder â Approvals</span>
            </div>
            {error != "" && <div className="text-error text-sm">{error}</div>}
            {actionError != "" && <div className="text-error text-sm">{actionError}</div>}
            {loading && approvals.length == 0 && <div className="text-secondary text-sm">Loadingâ¦</div>}
            {showDisconnected && (
                <div className="text-secondary text-sm">
                    Not connected â Recoder is starting…
                </div>
            )}
            {showEmpty && <div className="text-secondary text-sm">No approvals waiting.</div>}
            <div className="flex flex-col gap-2">
                {approvals.map((a) => {
                    const target = targetLabel(a);
                    const busy = acting == a.approvalId;
                    return (
                        <div
                            key={a.approvalId}
                            className="flex flex-col gap-2 rounded border border-border p-3"
                            title={a.approvalId}
                        >
                            <div className="flex flex-col gap-0.5">
                                <div className="text-sm font-medium">{a.reason || "Approval requested"}</div>
                                {target != "" && (
                                    <div className="text-xs text-secondary font-mono truncate">{target}</div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-secondary flex-wrap">
                                <span className="rounded bg-border/60 px-1.5 py-0.5">{riskLabel(a)}</span>
                                <span>by {a.requestedBy || "unknown"}</span>
                                {a.status == "escalated" && (
                                    <span className="text-error">escalated</span>
                                )}
                                <span className="ml-auto font-mono truncate">{a.taskId}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={busy}
                                    className="bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
                                    onClick={() => model.decide(a.approvalId, "approve")}
                                >
                                    {busy ? "â¦" : "Approve"}
                                </button>
                                <button
                                    disabled={busy}
                                    className="border border-border text-primary rounded px-2 py-0.5 text-sm hover:bg-border/40 transition-colors cursor-pointer disabled:opacity-50"
                                    onClick={() => model.decide(a.approvalId, "reject")}
                                >
                                    {busy ? "â¦" : "Reject"}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

RecoderApprovalsView.displayName = "RecoderApprovalsView";

export { RecoderApprovalsView };
