// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState } from "react";

// `keywords` is extra searchable text NOT shown in the row — a workspace command
// carries its branch/project/agent/state/prompt here so the palette finds it by
// any of those, turning ⌘K into workspace search, not just command-title search.
type RecoderCommand = { id: string; title: string; shortcut?: string; keywords?: string; run: () => void };

type RecoderCommandPaletteProps = { commands: RecoderCommand[]; onClose: () => void };

// Case-insensitive subsequence match: walk the target once, advancing a query
// pointer on each char hit; a match is when the pointer consumes the whole query.
// An empty query matches everything so the palette opens showing the full list.
function fuzzyMatch(query: string, target: string): boolean {
    const q = query.toLowerCase();
    if (q == "") {
        return true;
    }
    const t = target.toLowerCase();
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] == q[qi]) {
            qi++;
        }
    }
    return qi == q.length;
}

// A command matches the query when the visible title OR its hidden keywords match.
// The two are matched SEPARATELY (not concatenated) so a subsequence can't span
// the title→keywords boundary and produce a surprising hit.
function commandMatches(query: string, command: RecoderCommand): boolean {
    return fuzzyMatch(query, command.title) || (command.keywords != null && fuzzyMatch(query, command.keywords));
}

type PaletteRowProps = { command: RecoderCommand; selected: boolean; onHover: () => void; onRun: () => void };

function PaletteRow({ command, selected, onHover, onRun }: PaletteRowProps) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!selected) {
            return;
        }
        ref.current?.scrollIntoView({ block: "nearest" });
    }, [selected]);
    return (
        <div
            ref={ref}
            onMouseEnter={onHover}
            onClick={onRun}
            className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${
                selected ? "bg-accent" : "hover:bg-white/[0.04] recoder-transition"
            }`}
        >
            <span className="text-sm text-primary tracking-tight">{command.title}</span>
            {command.shortcut && <span className="ml-auto text-xs text-meta font-mono">{command.shortcut}</span>}
        </div>
    );
}

PaletteRow.displayName = "PaletteRow";

function RecoderCommandPalette({ commands, onClose }: RecoderCommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const filtered = useMemo(() => commands.filter((c) => commandMatches(query, c)), [commands, query]);

    useEffect(() => {
        if (filtered.length == 0) {
            setSelected(0);
            return;
        }
        setSelected((prev) => Math.max(0, Math.min(prev, filtered.length - 1)));
    }, [filtered.length]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const len = filtered.length;
        if (e.key == "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            if (len > 0) {
                setSelected((prev) => (prev + 1) % len);
            }
            return;
        }
        if (e.key == "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            if (len > 0) {
                setSelected((prev) => (prev - 1 + len) % len);
            }
            return;
        }
        if (e.key == "Enter") {
            e.preventDefault();
            e.stopPropagation();
            const cmd = filtered[selected];
            if (cmd != null) {
                cmd.run();
                onClose();
            }
            return;
        }
        if (e.key == "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    };

    const runCommand = (cmd: RecoderCommand) => {
        cmd.run();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[var(--zindex-typeahead-modal)]">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="absolute left-1/2 top-[15%] -translate-x-1/2 w-[520px] max-w-[90vw] bg-modalbg border border-white/8 rounded-md shadow-lg recoder-enter">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Type a command…"
                    className="w-full bg-transparent px-3 py-2 text-sm border-b border-white/8 focus:outline-none"
                />
                <div className="max-h-80 overflow-y-auto py-1">
                    {filtered.length == 0 ? (
                        <div className="text-meta px-3 py-2 text-sm">No matching commands</div>
                    ) : (
                        filtered.map((cmd, index) => (
                            <PaletteRow
                                key={cmd.id}
                                command={cmd}
                                selected={index == selected}
                                onHover={() => setSelected(index)}
                                onRun={() => runCommand(cmd)}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

RecoderCommandPalette.displayName = "RecoderCommandPalette";

export { RecoderCommandPalette, commandMatches, fuzzyMatch, type RecoderCommand };
