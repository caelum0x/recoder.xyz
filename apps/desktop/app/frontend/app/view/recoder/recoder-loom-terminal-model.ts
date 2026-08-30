// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom } from "jotai";
import { WorkspaceIdMetaKey } from "./recoder-detail-open";
import { RecoderLoomTerminalView } from "./recoder-loom-terminal";

class RecoderLoomTerminalViewModel implements ViewModel {
    viewType = "recoder-loom-terminal";
    viewIcon: Atom<string> = atom("terminal");
    viewName: Atom<string> = atom("Workspace Terminal");
    blockId: string;
    blockAtom: Atom<Block>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.blockAtom = initOpts.waveEnv.wos.getWaveObjectAtom<Block>(`block:${initOpts.blockId}`);
    }

    get viewComponent(): ViewComponent {
        return RecoderLoomTerminalView;
    }

    workspaceId(): string {
        const block = globalStore.get(this.blockAtom);
        const value = ((block?.meta ?? {}) as Record<string, unknown>)[WorkspaceIdMetaKey];
        return typeof value == "string" ? value.trim() : "";
    }
}

export { RecoderLoomTerminalViewModel };
