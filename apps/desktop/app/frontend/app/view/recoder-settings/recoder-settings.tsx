// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { FIELD_LABEL, INPUT, PAGE_TITLE, PRIMARY_BTN, QUIET_BTN } from "@/app/view/recoder/recoder-styles";
import { cn } from "@/util/util";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { DefaultRecoderBackend } from "../recoder/recoder-endpoints";
import { ProviderKeyNames, RecoderSettingsViewModel } from "./recoder-settings-model";

interface ProviderKeyRowProps {
    model: RecoderSettingsViewModel;
    name: string;
}

function ProviderKeyRow({ model, name }: ProviderKeyRowProps) {
    const drafts = useAtomValue(model.providerKeyDraftsAtom);
    const keysSet = useAtomValue(model.providerKeysSetAtom);
    const draft = drafts[name] ?? "";
    const isSet = keysSet[name] == true;

    return (
        <div className="flex items-center gap-2">
            <span className="w-44 shrink-0 text-xs font-mono text-secondary">{name}</span>
            <input
                className={`${INPUT} flex-1 min-w-0 font-mono`}
                type="password"
                value={draft}
                placeholder={isSet ? "•••••••• (saved)" : "not set"}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => model.setProviderKeyDraft(name, e.target.value)}
            />
            <button className={QUIET_BTN} disabled={draft.trim() == ""} onClick={() => model.saveProviderKey(name)}>
                Save
            </button>
            {isSet && (
                <button className={QUIET_BTN} onClick={() => model.clearProviderKey(name)}>
                    Clear
                </button>
            )}
        </div>
    );
}

function RecoderSettingsView({ model }: ViewComponentProps<RecoderSettingsViewModel>) {
    const [url, setUrl] = useAtom(model.urlAtom);
    const savedUrl = useAtomValue(model.savedUrlAtom);
    const testStatus = useAtomValue(model.testStatusAtom);
    const testMessage = useAtomValue(model.testMessageAtom);
    const testDetail = useAtomValue(model.testDetailAtom);
    const providerKeyError = useAtomValue(model.providerKeyErrorAtom);

    useEffect(() => {
        model.refreshProviderKeys();
    }, [model]);

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-3">
            <span className={PAGE_TITLE}>Settings</span>
            <div className="flex flex-col gap-1">
                <label className={FIELD_LABEL}>Backend URL</label>
                <input
                    className={`${INPUT} font-mono`}
                    value={url}
                    placeholder={DefaultRecoderBackend}
                    spellCheck={false}
                    onChange={(e) => setUrl(e.target.value)}
                />
                <div className="text-xs text-secondary">
                    Currently using: <span className="font-mono">{savedUrl}</span>
                </div>
                <div className="text-xs text-secondary">
                    Recoder loads your workspaces and runs from this backend. Point it at a remote Recoder to drive
                    agents on another machine.
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button className={PRIMARY_BTN} onClick={() => model.save(url)}>
                    Save
                </button>
                <button className={QUIET_BTN} onClick={() => model.test(url)}>
                    Test connection
                </button>
                <button className={QUIET_BTN} onClick={() => model.resetDefault()}>
                    Reset to default
                </button>
            </div>
            {testStatus != "" && (
                <div
                    className={cn(
                        "text-sm",
                        testStatus == "ok"
                            ? "text-success"
                            : testStatus == "degraded"
                              ? "text-warning"
                              : testStatus == "fail"
                                ? "text-error"
                                : "text-secondary"
                    )}
                >
                    {testStatus == "testing" ? "Testing…" : testMessage}
                </div>
            )}
            {testStatus != "" && testStatus != "testing" && testDetail.length > 0 && (
                <div className="flex flex-col gap-0.5">
                    {testDetail.map((line, idx) => (
                        <div key={idx} className="text-xs text-secondary font-mono whitespace-pre">
                            {line}
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-col gap-2 border-t border-border pt-3">
                <label className={FIELD_LABEL}>Provider keys</label>
                {ProviderKeyNames.map((name) => (
                    <ProviderKeyRow key={name} model={model} name={name} />
                ))}
                {providerKeyError != "" && <div className="text-sm text-error">{providerKeyError}</div>}
                <div className="text-xs text-secondary">
                    Agents launched by Recoder use their own CLI logins; these keys power the built-in gateway features.
                </div>
            </div>
        </div>
    );
}

RecoderSettingsView.displayName = "RecoderSettingsView";

export { RecoderSettingsView };
