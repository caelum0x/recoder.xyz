// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl, setRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderSettingsView } from "./recoder-settings";
import { describeConductorHealth, summarizeHealthReport } from "./recoder-settings-health";

// Connection-test state: idle / in-flight / healthy / reachable-but-impaired / unreachable.
type TestStatus = "" | "testing" | "ok" | "degraded" | "fail";

// Canonical secret names: these must match the BYOK_SECRET_ENV_NAMES allowlist
// in emain/emain-backend-runtime-env.ts — that is the exact set the supervisor
// lifts out of <configDir>/secrets.enc into the embedded backend's spawn env.
const ProviderKeyNames = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GOOGLE_API_KEY"];

class RecoderSettingsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    urlAtom: PrimitiveAtom<string>;
    savedUrlAtom: PrimitiveAtom<string>;
    testStatusAtom: PrimitiveAtom<TestStatus>;
    testMessageAtom: PrimitiveAtom<string>;
    testDetailAtom: PrimitiveAtom<string[]>;
    providerKeysSetAtom: PrimitiveAtom<Record<string, boolean>>;
    providerKeyDraftsAtom: PrimitiveAtom<Record<string, string>>;
    providerKeyErrorAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-settings";
        this.viewIcon = atom("gear");
        this.viewName = atom("Settings");
        this.urlAtom = atom(getRecoderBackendUrl()) as PrimitiveAtom<string>;
        this.savedUrlAtom = atom(getRecoderBackendUrl()) as PrimitiveAtom<string>;
        this.testStatusAtom = atom("") as PrimitiveAtom<TestStatus>;
        this.testMessageAtom = atom("") as PrimitiveAtom<string>;
        this.testDetailAtom = atom([]) as PrimitiveAtom<string[]>;
        this.providerKeysSetAtom = atom({}) as PrimitiveAtom<Record<string, boolean>>;
        this.providerKeyDraftsAtom = atom({}) as PrimitiveAtom<Record<string, string>>;
        this.providerKeyErrorAtom = atom("") as PrimitiveAtom<string>;
    }

    get viewComponent(): ViewComponent {
        return RecoderSettingsView;
    }

    // Persist the override (empty reverts to default) and reflect the now-effective url.
    save(url: string) {
        setRecoderBackendUrl(url);
        const effective = getRecoderBackendUrl();
        globalStore.set(this.savedUrlAtom, effective);
        globalStore.set(this.urlAtom, effective);
        globalStore.set(this.testStatusAtom, "");
        globalStore.set(this.testMessageAtom, "");
        globalStore.set(this.testDetailAtom, []);
    }

    resetDefault() {
        this.save("");
    }

    setProviderKeyDraft(name: string, value: string) {
        const drafts = globalStore.get(this.providerKeyDraftsAtom);
        globalStore.set(this.providerKeyDraftsAtom, { ...drafts, [name]: value });
    }

    // The store never returns values to the UI — only NAMES. A saved key shows
    // as "set" and can be overwritten or cleared, never read back.
    async refreshProviderKeys() {
        try {
            const names = await RpcApi.GetSecretsNamesCommand(TabRpcClient);
            const present: Record<string, boolean> = {};
            for (const name of ProviderKeyNames) {
                present[name] = Array.isArray(names) && names.includes(name);
            }
            globalStore.set(this.providerKeysSetAtom, present);
            globalStore.set(this.providerKeyErrorAtom, "");
        } catch (e) {
            globalStore.set(this.providerKeyErrorAtom, `Failed to read secret store: ${e?.message ?? e}`);
        }
    }

    async saveProviderKey(name: string) {
        const draft = (globalStore.get(this.providerKeyDraftsAtom)[name] ?? "").trim();
        if (draft == "") {
            return;
        }
        try {
            await RpcApi.SetSecretsCommand(TabRpcClient, { [name]: draft });
            const drafts = globalStore.get(this.providerKeyDraftsAtom);
            globalStore.set(this.providerKeyDraftsAtom, { ...drafts, [name]: "" });
            await this.refreshProviderKeys();
        } catch (e) {
            globalStore.set(this.providerKeyErrorAtom, `Failed to save ${name}: ${e?.message ?? e}`);
        }
    }

    async clearProviderKey(name: string) {
        try {
            await RpcApi.SetSecretsCommand(TabRpcClient, { [name]: null });
            await this.refreshProviderKeys();
        } catch (e) {
            globalStore.set(this.providerKeyErrorAtom, `Failed to clear ${name}: ${e?.message ?? e}`);
        }
    }

    // Backend doctor: probe /api/conductor/health and diagnose the BODY (a
    // reachable backend with no tmux substrate must not look healthy), then
    // append the /health/full per-source rollup. Degrade-safe: transport
    // failure lands on the truthful "fail" state, and a rollup fault appends
    // nothing — the conductor probe alone already decided reachability.
    async test(url: string) {
        const target = (url.trim() || getRecoderBackendUrl()).replace(/\/+$/, "");
        globalStore.set(this.testStatusAtom, "testing");
        globalStore.set(this.testMessageAtom, "");
        globalStore.set(this.testDetailAtom, []);
        try {
            const res = await fetch(`${target}/api/conductor/health`);
            if (!res.ok) {
                globalStore.set(this.testStatusAtom, "fail");
                globalStore.set(this.testMessageAtom, `Backend returned HTTP ${res.status}`);
                return;
            }
            const body = await res.json().catch(() => undefined);
            const diagnosis = describeConductorHealth(body, res.status);
            globalStore.set(this.testStatusAtom, diagnosis.status);
            globalStore.set(this.testMessageAtom, diagnosis.lines[0] ?? `Reachable (HTTP ${res.status})`);
            globalStore.set(this.testDetailAtom, diagnosis.lines.slice(1));
        } catch {
            globalStore.set(this.testStatusAtom, "fail");
            globalStore.set(this.testMessageAtom, "Not reachable");
            return;
        }
        try {
            // Root-mounted (NOT /api/conductor); answers the raw HealthReport
            // with HTTP 503 when down, so the body is parsed regardless of res.ok.
            const res = await fetch(`${target}/health/full`);
            const rollup = summarizeHealthReport(await res.json());
            if (rollup.length > 0) {
                globalStore.set(this.testDetailAtom, [...globalStore.get(this.testDetailAtom), ...rollup]);
            }
        } catch {
            // ignored: reachability was already decided by the conductor probe
        }
    }
}

export { ProviderKeyNames, RecoderSettingsViewModel };
