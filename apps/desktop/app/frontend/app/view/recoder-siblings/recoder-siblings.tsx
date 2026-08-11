// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, META, PAGE_TITLE, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderSiblingsViewModel, type SiblingContextDelivery } from "./recoder-siblings-model";

const REFRESH_MS = 6000;

function DeliveryRow({ delivery }: { delivery: SiblingContextDelivery }) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2">
            <div className="flex items-center gap-2">
                <span className="text-sm">
                    <span className="font-mono">{delivery.fromWorkspaceId}</span> steered{" "}
                    <span className="font-mono">{delivery.toWorkspaceId}</span> at{" "}
                    <span className="font-medium">{delivery.milestone}</span>
                </span>
                {delivery.at != "" && <span className={`${STATE_CHIP} ml-auto font-mono`}>{delivery.at}</span>}
            </div>
            {delivery.note != "" && <div className="text-secondary text-sm whitespace-pre-wrap break-words">{delivery.note}</div>}
        </div>
    );
}

function RecoderSiblingsView({ model }: ViewComponentProps<RecoderSiblingsViewModel>) {
    const workspaceId = useAtomValue(model.workspaceIdAtom);
    const feed = useAtomValue(model.feedAtom);
    const notice = useAtomValue(model.noticeAtom);
    const error = useAtomValue(model.errorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        if (workspaceId == "") {
            return;
        }
        model.load(workspaceId);
        const id = setInterval(() => model.load(workspaceId), REFRESH_MS);
        return () => clearInterval(id);
    }, [model, workspaceId]);

    const showDisconnected = !connected && error == "" && !loading;

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Siblings</span>
                <span className={META}>Cross-pollination feed</span>
            </div>
            <RecoderErrorRow message={error} />
            {loading && feed.length == 0 && notice == "" && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="The sibling feed loads once it is ready." />
            )}
            {feed.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className={FIELD_LABEL}>Deliveries</div>
                    {feed.map((d, i) => (
                        <DeliveryRow key={`${d.fromWorkspaceId}:${d.at}:${i}`} delivery={d} />
                    ))}
                </div>
            )}
            {feed.length == 0 && notice != "" && (
                <RecoderEmpty
                    title={notice}
                    hint="Parallel-run siblings steer mid-run context to each other; deliveries show up here as they happen."
                />
            )}
        </div>
    );
}

RecoderSiblingsView.displayName = "RecoderSiblingsView";

export { RecoderSiblingsView };
