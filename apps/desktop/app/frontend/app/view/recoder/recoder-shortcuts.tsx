// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect } from "react";
import { SECTION_TITLE } from "./recoder-styles";

const ShortcutRows: { keys: string; action: string }[] = [
    { keys: "N", action: "New agent" },
    { keys: "⌘P / ⌘K", action: "Command palette" },
    { keys: "j / k or ↑ / ↓", action: "Select workspace" },
    { keys: "Enter", action: "Open session" },
    { keys: "⌘Enter", action: "Launch" },
    { keys: "Esc", action: "Close" },
];

type RecoderShortcutsOverlayProps = { onClose: () => void };

function RecoderShortcutsOverlay({ onClose }: RecoderShortcutsOverlayProps) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key != "Escape") {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            onClose();
        };
        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[var(--zindex-typeahead-modal)]">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="absolute left-1/2 top-[15%] -translate-x-1/2 w-[380px] max-w-[90vw] bg-modalbg border border-white/8 rounded-md shadow-lg recoder-enter">
                <div className="flex items-center px-3 py-2 border-b border-white/8">
                    <span className={SECTION_TITLE}>Keyboard shortcuts</span>
                    <span className="ml-auto text-xs text-meta font-mono">⌘/</span>
                </div>
                <div className="flex flex-col py-1">
                    {ShortcutRows.map((row) => (
                        <div key={row.keys} className="flex items-center gap-2 px-3 py-1.5">
                            <span className="text-sm text-primary tracking-tight">{row.action}</span>
                            <span className="ml-auto text-xs text-meta font-mono">{row.keys}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

RecoderShortcutsOverlay.displayName = "RecoderShortcutsOverlay";

export { RecoderShortcutsOverlay };
