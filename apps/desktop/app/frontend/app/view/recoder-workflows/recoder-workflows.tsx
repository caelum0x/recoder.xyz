// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { META, PAGE_TITLE, ROW_TITLE, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderWorkflow, RecoderWorkflowsViewModel } from "./recoder-workflows-model";

const REFRESH_MS = 6000;

function WorkflowRow({ workflow }: { workflow: RecoderWorkflow }) {
    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2" title={workflow.id}>
            <div className="flex items-center gap-2">
                <span className={`${ROW_TITLE} truncate`}>{workflow.name}</span>
                <span className={`${STATE_CHIP} ml-auto`}>
                    {workflow.nodeCount} {workflow.nodeCount == 1 ? "step" : "steps"}
                </span>
            </div>
            {workflow.nodes.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1">
                    {workflow.nodes.map((node, i) => (
                        <div key={i} className="flex items-center gap-1">
                            {i > 0 && <span className={META}>→</span>}
                            <span className={STATE_CHIP} title={node.kind}>
                                {node.name}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <span className={META}>No steps defined</span>
            )}
        </div>
    );
}

function RecoderWorkflowsView({ model }: ViewComponentProps<RecoderWorkflowsViewModel>) {
    const workflows = useAtomValue(model.workflowsAtom);
    const dispatchConfigured = useAtomValue(model.dispatchConfiguredAtom);
    const error = useAtomValue(model.errorAtom);
    const notice = useAtomValue(model.noticeAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showSkeleton = loading && workflows.length == 0 && error == "" && notice == "";
    const showDisconnected = !connected && !loading && error == "";
    const dispatchLabel = dispatchConfigured ? "dispatch configured" : "dispatch not configured on this machine";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Workflows</span>
                {connected && <span className={`${STATE_CHIP} ml-auto`}>{dispatchLabel}</span>}
            </div>
            <RecoderErrorRow message={error} />
            {showSkeleton && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Workflows load once it is ready." />
            )}
            {notice != "" && (
                <RecoderEmpty
                    title={notice}
                    hint="No governed pipeline (verify → approval-wait → PR → deploy) has been defined here."
                />
            )}
            {workflows.map((workflow) => (
                <WorkflowRow key={workflow.id} workflow={workflow} />
            ))}
        </div>
    );
}

RecoderWorkflowsView.displayName = "RecoderWorkflowsView";

export { RecoderWorkflowsView };
