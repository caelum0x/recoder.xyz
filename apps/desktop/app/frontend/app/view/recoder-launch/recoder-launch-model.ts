// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom } from "jotai";
import { RecoderLaunchView } from "./recoder-launch";

// Optional seed values a caller (e.g. the board's "Pick up") can pass through the
// block meta. The launch surface is now a redirect into the Workspaces hub, so we
// only read them to forward them onward — never to drive a form here.
const PrefillTaskMetaKey = "recoder:prefilltask";
const PrefillRepoMetaKey = "recoder:prefillrepo";

// Reads a string meta key off a freshly-created block. Untrusted external data:
// anything non-string (or absent) degrades to "" so the redirect stays plain.
function readStringMeta(meta: Record<string, unknown>, key: string): string {
    const raw = meta[key];
    return typeof raw === "string" ? raw.trim() : "";
}

class RecoderLaunchViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    prefillTask: string;
    prefillRepo: string;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-launch";
        this.viewIcon = atom("rocket");
        this.viewName = atom("Launch");
        const block = initOpts.waveEnv.wos.getWaveObjectAtom<Block>(`block:${initOpts.blockId}`);
        const meta = (globalStore.get(block)?.meta ?? {}) as Record<string, unknown>;
        this.prefillTask = readStringMeta(meta, PrefillTaskMetaKey);
        this.prefillRepo = readStringMeta(meta, PrefillRepoMetaKey);
    }

    get viewComponent(): ViewComponent {
        return RecoderLaunchView;
    }
}

export { RecoderLaunchViewModel };
