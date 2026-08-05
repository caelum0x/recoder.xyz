// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { FIELD_LABEL, INPUT, META, PAGE_TITLE, PRIMARY_BTN, QUIET_BTN, ROW_TITLE, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { cn } from "@/util/util";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { DefaultRecoderBackend } from "../recoder/recoder-endpoints";
import { RecoderIdentityModel } from "../recoder/recoder-identity-model";
import { ProviderKeyNames, RecoderSettingsViewModel } from "./recoder-settings-model";

// One calm section per concern (DESIGN §3C: Account, Agents, Keys, Connection).
// Quiet uppercase header + a thin divider, most-human-first with the advanced
// Connection block last.
interface SectionProps {
    title: string;
    children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
    return (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
            <label className={FIELD_LABEL}>{title}</label>
            {children}
        </div>
    );
}

// Read-only truthful identity. Signed-out is a valid resting state (Recoder runs
// locally without an account), so it is a quiet line + a single sign-in action —
// never a gate.
function AccountSection() {
    const identityModel = RecoderIdentityModel.getInstance();
    const identity = useAtomValue(identityModel.identityAtom);
    const signingIn = useAtomValue(identityModel.signingInAtom);
    const signInError = useAtomValue(identityModel.signInErrorAtom);

    useEffect(() => {
        void identityModel.refresh();
    }, [identityModel]);

    if (identity == null) {
        return (
            <Section title="Account">
                <div className="text-sm text-secondary">
                    Not signed in. Recoder runs locally without an account; sign in to sync your identity and repos.
                </div>
                <div>
                    <button className={PRIMARY_BTN} disabled={signingIn} onClick={() => identityModel.signIn()}>
                        {signingIn ? "Waiting for browser…" : "Sign in with Recoder"}
                    </button>
                </div>
                {signInError != "" && <div className="text-sm text-error">{signInError}</div>}
            </Section>
        );
    }

    const displayName = (identity.name ?? "").trim() || (identity.email ?? "").trim() || "Signed in";
    const email = (identity.email ?? "").trim();
    const plan = (identity.plan ?? "").trim();

    return (
        <Section title="Account">
            <div className="flex flex-col gap-0.5">
                <span className={ROW_TITLE}>{displayName}</span>
                {email != "" && email != displayName && <span className={META}>{email}</span>}
                {plan != "" && <span className={META}>Plan: {plan}</span>}
            </div>
            <div>
                <button className={QUIET_BTN} onClick={() => identityModel.signOut()}>
                    Sign out
                </button>
            </div>
        </Section>
    );
}

// Read-only list of the coding agents detected on this machine. The actual choice
// of which agent(s) run a task happens per-launch; this section only reports what
// is available. Omitted entirely when nothing is detected (no fake dropdown).
function AgentsSection({ model }: { model: RecoderSettingsViewModel }) {
    const agents = useAtomValue(model.detectedAgentsAtom);
    const loaded = useAtomValue(model.agentsLoadedAtom);

    useEffect(() => {
        void model.refreshAgents();
    }, [model]);

    if (!loaded || agents.length == 0) {
        return null;
    }

    return (
        <Section title="Agents">
            <div className="flex flex-wrap gap-1.5">
                {agents.map((agent) => (
                    <span key={agent.runtimeId} className={STATE_CHIP}>
                        {agent.label}
                    </span>
                ))}
            </div>
            <div className="text-xs text-secondary">
                Detected on this machine. Choose which of them runs a task each time you launch.
            </div>
        </Section>
    );
}

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

function KeysSection({ model }: { model: RecoderSettingsViewModel }) {
    const providerKeyError = useAtomValue(model.providerKeyErrorAtom);

    useEffect(() => {
        void model.refreshProviderKeys();
    }, [model]);

    return (
        <Section title="Provider keys">
            {ProviderKeyNames.map((name) => (
                <ProviderKeyRow key={name} model={model} name={name} />
            ))}
            {providerKeyError != "" && <div className="text-sm text-error">{providerKeyError}</div>}
            <div className="text-xs text-secondary">
                Agents launched by Recoder use their own CLI logins; these keys power the built-in gateway features.
            </div>
        </Section>
    );
}

// Advanced: which backend drives this window. Quiet by design — the loopback
// default is right for almost everyone; only a remote setup needs to touch it.
function ConnectionSection({ model }: { model: RecoderSettingsViewModel }) {
    const [url, setUrl] = useAtom(model.urlAtom);
    const savedUrl = useAtomValue(model.savedUrlAtom);
    const testStatus = useAtomValue(model.testStatusAtom);
    const testMessage = useAtomValue(model.testMessageAtom);
    const testDetail = useAtomValue(model.testDetailAtom);

    return (
        <Section title="Connection · advanced">
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
                Recoder loads your workspaces and runs from this backend. Point it at a remote Recoder to drive agents on
                another machine.
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
                <div className={cn("text-sm", testStatus == "fail" ? "text-error" : "text-secondary")}>
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
        </Section>
    );
}

function RecoderSettingsView({ model }: ViewComponentProps<RecoderSettingsViewModel>) {
    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-3">
            <span className={PAGE_TITLE}>Settings</span>
            <AccountSection />
            <AgentsSection model={model} />
            <KeysSection model={model} />
            <ConnectionSection model={model} />
        </div>
    );
}

RecoderSettingsView.displayName = "RecoderSettingsView";

export { RecoderSettingsView };
