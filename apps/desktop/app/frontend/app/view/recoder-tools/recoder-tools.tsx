// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { Capabilities, RecoderToolsViewModel, type RecoderToolResult } from "./recoder-tools-model";

const REFRESH_MS = 6000;

function resultText(result: unknown): string {
    if (result == null) {
        return "";
    }
    if (typeof result === "string") {
        return result;
    }
    try {
        return JSON.stringify(result, null, 2);
    } catch {
        return String(result);
    }
}

function ResultPane({ result }: { result: RecoderToolResult }) {
    if (result.unavailable) {
        return (
            <div className="rounded border border-border p-3 text-sm text-secondary">
                Capability not available in this run.
                {result.reason != null && result.reason !== "" && (
                    <div className="text-xs mt-1 font-mono truncate">{result.reason}</div>
                )}
            </div>
        );
    }
    if (result.status === "not_configured") {
        return (
            <div className="rounded border border-border p-3 text-sm">
                <div className="font-semibold text-secondary">Not configured</div>
                <div className="text-xs text-secondary mt-1">
                    {result.reason != null && result.reason !== "" ? result.reason : "This engine is not configured on this machine."}
                </div>
            </div>
        );
    }
    if (!result.ok) {
        return (
            <div className="rounded border border-border p-3 text-sm text-secondary">
                {result.reason != null && result.reason !== "" ? result.reason : `No result (${result.status}).`}
            </div>
        );
    }
    const text = resultText(result.result);
    return (
        <div className="rounded border border-border p-3 text-sm flex flex-col gap-1">
            <div className="text-xs uppercase tracking-wide text-secondary">Result</div>
            {text === "" ? (
                <div className="text-secondary">Completed with no output.</div>
            ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs m-0">{text}</pre>
            )}
        </div>
    );
}

function RecoderToolsView({ model }: ViewComponentProps<RecoderToolsViewModel>) {
    const [capabilityId, setCapabilityId] = useAtom(model.capabilityIdAtom);
    const [input, setInput] = useAtom(model.inputAtom);
    const [topK, setTopK] = useAtom(model.topKAtom);
    const running = useAtomValue(model.runningAtom);
    const result = useAtomValue(model.resultAtom);
    const serverIds = useAtomValue(model.serverIdsAtom);
    const serversLoaded = useAtomValue(model.serversLoadedAtom);

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => model.refresh(), REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const cap = Capabilities.find((c) => c.id === capabilityId) ?? Capabilities[0];
    const canRun = !running && input.trim() !== "";
    const unregistered = serversLoaded && !serverIds.includes(cap.serverId);

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-3">
            <div className="flex items-center gap-2">
                <span className="font-semibold">Capability palette</span>
                <span className="text-xs text-secondary">governed engines</span>
            </div>

            <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-secondary">Capability</span>
                <select
                    className="rounded border border-border bg-transparent px-2 py-1 text-sm cursor-pointer"
                    value={capabilityId}
                    onChange={(e) => setCapabilityId(e.target.value)}
                >
                    {Capabilities.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.label}
                        </option>
                    ))}
                </select>
            </label>

            {unregistered && (
                <div className="text-xs text-secondary">
                    {cap.serverId} is not registered on the connected backend — running it may report not available.
                </div>
            )}

            <label className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-secondary">{cap.inputLabel}</span>
                <input
                    className="rounded border border-border bg-transparent px-2 py-1 text-sm"
                    placeholder={cap.inputPlaceholder}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && canRun) {
                            model.run();
                        }
                    }}
                />
            </label>

            {cap.hasTopK && (
                <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-secondary">Top K (optional)</span>
                    <input
                        className="rounded border border-border bg-transparent px-2 py-1 text-sm w-24"
                        placeholder="5"
                        inputMode="numeric"
                        value={topK}
                        onChange={(e) => setTopK(e.target.value)}
                    />
                </label>
            )}

            <button
                className="bg-accent/80 text-primary rounded px-2 py-1 text-sm hover:bg-accent transition-colors cursor-pointer self-start disabled:opacity-50"
                disabled={!canRun}
                onClick={() => model.run()}
            >
                {running ? "Running…" : "Run"}
            </button>

            {result != null && <ResultPane result={result} />}
        </div>
    );
}

RecoderToolsView.displayName = "RecoderToolsView";

export { RecoderToolsView };
