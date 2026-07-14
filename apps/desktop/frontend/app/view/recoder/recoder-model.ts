// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import type { Workspace } from "@recoder/conductor-ui";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { RecoderConductorView } from "./recoder";

// SHELL FUSION: the workspace shape comes from @recoder/conductor-ui (the typed
// client package the cockpit shares) instead of a hand-rolled local mirror. The
// shell renders a lenient subset — the backend may be older/newer, so state stays
// a plain string here and everything beyond the picked fields remains optional.
type RecoderWorkspace = Pick<Workspace, "workspaceId" | "branch" | "runtimeId"> & {
    state: string;
    substrate?: string;
    sessionName?: string;
    metadata?: Record<string, unknown>;
};

// First-run readiness surfaced by the conductor /health/full endpoint — which
// coding agents are installed + whether git is present. Drives the Recoder-first
// getting-started panel shown when there are no workspaces yet.
type RecoderSetup = {
    agents: { runtimeId: string; available: boolean }[];
    git: boolean;
    loaded: boolean;
};

class RecoderViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    workspacesAtom: PrimitiveAtom<RecoderWorkspace[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    setupAtom: PrimitiveAtom<RecoderSetup>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder";
        this.viewIcon = atom("layer-group");
        this.viewName = atom("Recoder");
        this.workspacesAtom = atom([]) as PrimitiveAtom<RecoderWorkspace[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.setupAtom = atom({ agents: [], git: false, loaded: false }) as PrimitiveAtom<RecoderSetup>;
    }

    // Degrade-safe: a failed/absent health probe leaves setup unloaded (the panel
    // simply shows a neutral getting-started message), never throwing.
    async refreshSetup() {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/health/full`);
            const body = await res.json();
            const h = body?.data ?? {};
            const agents = Array.isArray(h?.runtimes)
                ? h.runtimes.map((r: { runtimeId: string; available: boolean }) => ({
                      runtimeId: r.runtimeId,
                      available: Boolean(r.available),
                  }))
                : [];
            globalStore.set(this.setupAtom, { agents, git: Boolean(h?.substrate?.git), loaded: true });
        } catch {
            globalStore.set(this.setupAtom, { agents: [], git: false, loaded: false });
        }
    }

    get viewComponent(): ViewComponent {
        return RecoderConductorView;
    }

    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces`);
            const body = await res.json();
            const list = body?.data ?? [];
            globalStore.set(this.workspacesAtom, Array.isArray(list) ? list : []);
        } catch (e) {
            globalStore.set(this.errorAtom, e instanceof Error ? e.message : String(e));
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
        // Setup readiness runs alongside (independently degrade-safe).
        this.refreshSetup();
    }
}

export { RecoderViewModel, type RecoderWorkspace, type RecoderSetup };
