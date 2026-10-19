// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { memo } from "react";
import type { MentionFileEntry } from "./aimention";
import type { MentionPopupState } from "./aimention-controller";

interface AIMentionPopupProps {
    state: MentionPopupState;
    onHover: (index: number) => void;
    onSelect: (entry: MentionFileEntry) => void;
}

export const AIMentionPopup = memo(({ state, onHover, onSelect }: AIMentionPopupProps) => {
    if (!state.active) return null;

    return (
        <div className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded border border-zinc-700 bg-zinc-800 shadow-lg z-10">
            {state.loading && <div className="px-2 py-1.5 text-xs text-gray-400">Indexing workspace files…</div>}
            {!state.loading && state.results.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-gray-400">No matching files</div>
            )}
            {!state.loading &&
                state.results.map((entry, idx) => (
                    <div
                        key={entry.absPath}
                        onMouseEnter={() => onHover(idx)}
                        onClick={() => onSelect(entry)}
                        className={cn(
                            "px-2 py-1 text-xs cursor-pointer truncate",
                            idx === state.selectedIndex ? "bg-accent/30 text-white" : "text-gray-300 hover:bg-zinc-700"
                        )}
                        title={entry.relPath}
                    >
                        {entry.relPath}
                    </div>
                ))}
        </div>
    );
});

AIMentionPopup.displayName = "AIMentionPopup";
