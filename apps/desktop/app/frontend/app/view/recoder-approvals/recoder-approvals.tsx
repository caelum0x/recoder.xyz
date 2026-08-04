// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { PAGE_TITLE, PRIMARY_BTN, QUIET_BTN, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderApproval, RecoderApprovalsViewModel } from "./recoder-approvals-model";

const REFRESH_MS = 6000;

function riskLabel(a: RecoderApproval): string {
    return a.riskTier ?? "gate";
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
                <span className={PAGE_TITLE}>Approvals</span>
            </div>
            <RecoderErrorRow message={error} />
            <RecoderErrorRow message={actionError} />
            {loading && approvals.length == 0 && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Pending approvals load once it is ready." />
            )}
            {showEmpty && (
                <RecoderEmpty
                    title="No approvals waiting"
                    hint="Risky actions pause here for your OK before they run."
                />
            )}
            <div className="flex flex-col gap-2">
                {approvals.map((a) => {
                    const action = a.action || "";
                    const busy = acting == a.id;
                    return (
                        <div key={a.id} className="flex flex-col gap-2 rounded border border-border p-3" title={a.id}>
                            <div className="flex flex-col gap-0.5">
                                <div className="text-sm font-medium">{a.reason || "Approval requested"}</div>
                                {action != "" && (
                                    <div className="text-xs text-secondary font-mono truncate">{action}</div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-secondary flex-wrap">
                                <span className={STATE_CHIP}>{riskLabel(a)}</span>
                                <span>by {a.requestedBy || "unknown"}</span>
                                <span className="ml-auto font-mono truncate">{a.taskId}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={busy}
                                    className={PRIMARY_BTN}
                                    onClick={() => model.decide(a.id, "approve")}
                                >
                                    {busy ? "…" : "Approve"}
                                </button>
                                <button
                                    disabled={busy}
                                    className={QUIET_BTN}
                                    onClick={() => model.decide(a.id, "reject")}
                                >
                                    {busy ? "…" : "Reject"}
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
