// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useAtom, useAtomValue } from "jotai";
import { RecoderSettingsViewModel } from "./recoder-settings-model";
import { DefaultRecoderBackend } from "../recoder/recoder-endpoints";

const ACCENT_BTN =
    "bg-accent/80 text-primary rounded px-2 py-0.5 text-sm hover:bg-accent transition-colors cursor-pointer";

function RecoderSettingsView({ model }: ViewComponentProps<RecoderSettingsViewModel>) {
    const [url, setUrl] = useAtom(model.urlAtom);
    const savedUrl = useAtomValue(model.savedUrlAtom);
    const testStatus = useAtomValue(model.testStatusAtom);
    const testMessage = useAtomValue(model.testMessageAtom);

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-3">
            <span className="font-semibold">Recoder — Settings</span>
            <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wide text-secondary">Backend URL</label>
                <input
                    className="bg-panel text-primary border border-border rounded px-2 py-1 text-sm font-mono"
                    value={url}
                    placeholder={DefaultRecoderBackend}
                    spellCheck={false}
                    onChange={(e) => setUrl(e.target.value)}
                />
                <div className="text-xs text-secondary">
                    Currently using: <span className="font-mono">{savedUrl}</span>
                </div>
                <div className="text-xs text-secondary">
                    The conductor + engine blocks fetch this backend. Point it at a remote Recoder to drive agents
                    on another machine.
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button className={ACCENT_BTN} onClick={() => model.save(url)}>
                    Save
                </button>
                <button className={ACCENT_BTN} onClick={() => model.test(url)}>
                    Test connection
                </button>
                <button className={ACCENT_BTN} onClick={() => model.resetDefault()}>
                    Reset to default
                </button>
            </div>
            {testStatus != "" && (
                <div
                    className={cn(
                        "text-sm",
                        testStatus == "ok" ? "text-success" : testStatus == "fail" ? "text-error" : "text-secondary",
                    )}
                >
                    {testStatus == "testing" ? "Testing…" : testMessage}
                </div>
            )}
        </div>
    );
}

RecoderSettingsView.displayName = "RecoderSettingsView";

export { RecoderSettingsView };
