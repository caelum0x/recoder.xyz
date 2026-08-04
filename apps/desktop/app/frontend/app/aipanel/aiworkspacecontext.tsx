// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { WaveAIModel } from "@/app/aipanel/waveai-model";
import { workspaceContextIndicatorLabel } from "@/app/view/recoder/recoder-waveai-context";
import { useAtomValue } from "jotai";
import { memo } from "react";

const AIWorkspaceContext = memo(() => {
    const model = WaveAIModel.getInstance();
    const context = useAtomValue(model.workspaceContextAtom);
    const detached = useAtomValue(model.workspaceContextDetachedAtom);
    const label = workspaceContextIndicatorLabel(context, detached);

    if (label == "") {
        return null;
    }

    return (
        <div className="px-3 pb-0.5">
            <button
                type="button"
                onClick={() => model.toggleWorkspaceContextDetached()}
                title={
                    detached
                        ? "Workspace context is detached — click to attach it to this chat"
                        : "Workspace context is attached to this chat — click to detach"
                }
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer truncate max-w-full"
            >
                {label}
            </button>
        </div>
    );
});

AIWorkspaceContext.displayName = "AIWorkspaceContext";

export { AIWorkspaceContext };
