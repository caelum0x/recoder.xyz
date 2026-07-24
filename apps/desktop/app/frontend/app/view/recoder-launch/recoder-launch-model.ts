// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderLaunchView } from "./recoder-launch";

// A coding agent Conductor can actually launch. Mirrors the payload of
// GET /api/conductor/runtimes → { runtimeId, bin, available, path? }. Only
// `available` runtimes are selectable in the picker; the rest render greyed.
type RecoderRuntime = {
    runtimeId: string;
    bin: string;
    available: boolean;
    path?: string;
};

// Outcome of a POST /api/conductor/workspaces attempt. `ok` distinguishes a
// truthful success (surface the new workspace id/branch) from a truthful
// failure (surface the backend's reason verbatim) — never a fabricated win.
type RecoderLaunchResult = {
    ok: boolean;
    workspaceId?: string;
    branch?: string;
    error?: string;
};

// Optional seed values a caller (e.g. the board's "Pick up") can pass through the
// block meta so the launch form opens pre-filled instead of empty.
const PrefillTaskMetaKey = "recoder:prefilltask";
const PrefillRepoMetaKey = "recoder:prefillrepo";

// Reads a string meta key off a freshly-created block. Untrusted external data:
// anything non-string (or absent) degrades to "" so the form behaves as before.
function readStringMeta(meta: Record<string, unknown>, key: string): string {
    const raw = meta[key];
    return typeof raw === "string" ? raw.trim() : "";
}

class RecoderLaunchViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    runtimesAtom: PrimitiveAtom<RecoderRuntime[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    postingAtom: PrimitiveAtom<boolean>;
    resultAtom: PrimitiveAtom<RecoderLaunchResult>;
    repoPathAtom: PrimitiveAtom<string>;
    runtimeIdAtom: PrimitiveAtom<string>;
    promptAtom: PrimitiveAtom<string>;
    branchAtom: PrimitiveAtom<string>;
    interactiveAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-launch";
        this.viewIcon = atom("rocket");
        this.viewName = atom("Launch Agent");
        this.runtimesAtom = atom([]) as PrimitiveAtom<RecoderRuntime[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.postingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.resultAtom = atom(null) as PrimitiveAtom<RecoderLaunchResult>;
        const block = initOpts.waveEnv.wos.getWaveObjectAtom<Block>(`block:${initOpts.blockId}`);
        const meta = (globalStore.get(block)?.meta ?? {}) as Record<string, unknown>;
        const prefillTask = readStringMeta(meta, PrefillTaskMetaKey);
        const prefillRepo = readStringMeta(meta, PrefillRepoMetaKey);
        this.repoPathAtom = atom(prefillRepo) as PrimitiveAtom<string>;
        this.runtimeIdAtom = atom("") as PrimitiveAtom<string>;
        this.promptAtom = atom(prefillTask) as PrimitiveAtom<string>;
        this.branchAtom = atom("") as PrimitiveAtom<string>;
        this.interactiveAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderLaunchView;
    }

    // Degrade-safe: a failed/absent probe leaves the runtime list empty and the
    // form shows a neutral "start the backend" state, never throwing.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/runtimes`);
            const body = await res.json();
            // GET /api/conductor/runtimes returns { data: { runtimes: [...] } } —
            // read the nested array, not `data` itself (which is the object). openfang
            // is the in-process engine, not a launchable coding agent, so drop it.
            const list = body?.data?.runtimes ?? [];
            const runtimes: RecoderRuntime[] = Array.isArray(list)
                ? list
                      .filter((r: RecoderRuntime) => String(r?.runtimeId ?? "") !== "openfang")
                      .map((r: RecoderRuntime) => ({
                          runtimeId: String(r?.runtimeId ?? ""),
                          bin: String(r?.bin ?? ""),
                          available: Boolean(r?.available),
                          path: r?.path,
                      }))
                : [];
            globalStore.set(this.runtimesAtom, runtimes);
            const current = globalStore.get(this.runtimeIdAtom);
            const firstReady = runtimes.find((r) => r.available);
            if (current == "" && firstReady != null) {
                globalStore.set(this.runtimeIdAtom, firstReady.runtimeId);
            }
        } catch (e) {
            globalStore.set(this.errorAtom, e instanceof Error ? e.message : String(e));
            globalStore.set(this.runtimesAtom, []);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    // Mirror of POST /api/conductor/workspaces (conductor.routes.ts:375): a simple
    // local create only needs `{ repoPath, prompt?, runtimeId?, branch?,
    // interactive? }`; identity fields default server-side. Non-2xx / non-success
    // is surfaced truthfully; the internal-key path failing is handled the same way.
    async launch() {
        const repoPath = globalStore.get(this.repoPathAtom).trim();
        const runtimeId = globalStore.get(this.runtimeIdAtom).trim();
        const prompt = globalStore.get(this.promptAtom).trim();
        const branch = globalStore.get(this.branchAtom).trim();
        const interactive = globalStore.get(this.interactiveAtom);
        globalStore.set(this.postingAtom, true);
        globalStore.set(this.resultAtom, null);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repoPath,
                    runtimeId: runtimeId || undefined,
                    prompt: prompt || undefined,
                    branch: branch || undefined,
                    interactive: interactive || undefined,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body?.success) {
                const reason = body?.error || `Launch failed (HTTP ${res.status})`;
                globalStore.set(this.resultAtom, { ok: false, error: String(reason) });
                return;
            }
            const ws = body?.data ?? {};
            globalStore.set(this.resultAtom, {
                ok: true,
                workspaceId: ws?.workspaceId,
                branch: ws?.branch,
            });
        } catch (e) {
            globalStore.set(this.resultAtom, {
                ok: false,
                error: e instanceof Error ? e.message : String(e),
            });
        } finally {
            globalStore.set(this.postingAtom, false);
        }
    }
}

export { RecoderLaunchViewModel, type RecoderRuntime, type RecoderLaunchResult };
