// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty } from "@/app/view/recoder/recoder-states";
import { PAGE_TITLE } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderSessionViewModel } from "./recoder-session-model";
import { RecoderSessionComposer } from "./recoder-session-composer";
import { RecoderSessionDiff } from "./recoder-session-diff";
import { RecoderSessionMessages } from "./recoder-session-messages";
import { RecoderSessionSidebar } from "./recoder-session-sidebar";

const STATUS_MESSAGES: Record<string, string> = {
    idle: "",
    connecting: "Connecting to the recoder environment server…",
    ready: "",
    error: "Not connected — start the recoder CLI to open a session.",
};

/**
 * The recoder-session Wave block (docs/RECODER-T3CODE-COMPOSITION.md section 4's
 * "apps/web" row, (a)+(b) only — no hosted app.recoder.xyz in this version):
 * thread sidebar, composer, message stream, and the full-thread diff Review
 * panel. Board/approval/converge stay Wave-native blocks; the raw interactive
 * terminal stays Loom's block, launched side by side (section 12).
 */
function RecoderSessionView({ model }: ViewComponentProps<RecoderSessionViewModel>) {
    const status = useAtomValue(model.statusAtom);
    const error = useAtomValue(model.errorAtom);
    const threads = useAtomValue(model.threadsAtom);
    const activeThreadId = useAtomValue(model.activeThreadIdAtom);

    useEffect(() => {
        model.initialize();
        return () => model.dispose();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- model identity is stable per block.
    }, [model]);

    const note = STATUS_MESSAGES[status] ?? "";

    return (
        <div className="flex h-full overflow-hidden">
            <div className="flex w-56 shrink-0 flex-col border-r border-border overflow-auto">
                <div className={`${PAGE_TITLE} px-2 pt-2`}>Session</div>
                <RecoderSessionSidebar model={model} threads={threads} activeThreadId={activeThreadId} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
                {status != "ready" && note != "" && <RecoderEmpty title={note} hint={error ?? undefined} />}
                {status == "ready" && activeThreadId == null && <RecoderEmpty title="No threads yet on this environment." />}
                {status == "ready" && activeThreadId != null && (
                    <>
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            <RecoderSessionMessages model={model} />
                        </div>
                        <RecoderSessionComposer model={model} />
                    </>
                )}
            </div>
            <div className="flex w-[420px] shrink-0 flex-col border-l border-border overflow-auto">
                <div className={`${PAGE_TITLE} px-2 pt-2`}>Review</div>
                <RecoderSessionDiff model={model} />
            </div>
        </div>
    );
}

export { RecoderSessionView };
