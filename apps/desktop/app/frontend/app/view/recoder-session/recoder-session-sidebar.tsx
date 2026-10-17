// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import type { SessionThreadSummary } from "@recoder/t3-session-bridge";
import { RecoderSessionViewModel } from "./recoder-session-model";

interface RecoderSessionSidebarProps {
    model: RecoderSessionViewModel;
    threads: readonly SessionThreadSummary[];
    activeThreadId: string | null;
}

/** The thread sidebar (apps/web's `src/components/sidebar`, ported). */
function RecoderSessionSidebar({ model, threads, activeThreadId }: RecoderSessionSidebarProps) {
    if (threads.length == 0) {
        return <div className="px-2 py-2 text-xs text-secondary">No threads yet.</div>;
    }
    return (
        <div className="flex flex-col gap-0.5 p-1">
            {threads.map((thread) => {
                const active = thread.id == activeThreadId;
                return (
                    <button
                        key={thread.id}
                        onClick={() => model.openThread(thread.id)}
                        className={`flex flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5 ${
                            active ? "bg-white/8" : ""
                        }`}
                    >
                        <span className="w-full truncate">{thread.title}</span>
                        <span className="flex items-center gap-1">
                            <span className={STATE_CHIP}>{thread.status}</span>
                            {thread.branch != null && (
                                <span className="truncate text-xs text-secondary font-mono">{thread.branch}</span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export { RecoderSessionSidebar };
