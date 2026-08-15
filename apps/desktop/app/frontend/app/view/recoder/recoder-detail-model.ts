// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { RecoderDiffViewModel } from "@/app/view/recoder-diff/recoder-diff-model";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderDetailView } from "./recoder-detail";
import { applyDetailNav, resolveDetailNav } from "./recoder-detail-container-logic";
import type { RecoderDetailFace } from "./recoder-detail-header";
import { DetailFaceMetaKey, WorkspaceIdMetaKey } from "./recoder-detail-open";
import { RecoderTerminalViewModel } from "./recoder-terminal-model";

function metaString(block: Block, key: string): string {
    const value = ((block?.meta ?? {}) as Record<string, unknown>)[key];
    return typeof value == "string" ? value.trim() : "";
}

class RecoderDetailViewModel implements ViewModel {
    viewType = "recoder-detail";
    viewIcon: Atom<string> = atom("code-compare");
    viewName: Atom<string> = atom("Workspace");
    blockId: string;
    blockAtom: Atom<Block>;
    activeFaceAtom: PrimitiveAtom<RecoderDetailFace>;
    workspaceIdAtom: PrimitiveAtom<string>;
    childVersionAtom: PrimitiveAtom<number>;
    private initOpts: ViewModelInitType;
    private terminalModel: RecoderTerminalViewModel | null = null;
    private diffModel: RecoderDiffViewModel | null = null;

    constructor(initOpts: ViewModelInitType) {
        this.initOpts = initOpts;
        this.blockId = initOpts.blockId;
        this.blockAtom = initOpts.waveEnv.wos.getWaveObjectAtom<Block>(`block:${initOpts.blockId}`);
        const block = globalStore.get(this.blockAtom);
        const face = metaString(block, DetailFaceMetaKey) == "review" ? "review" : "session";
        this.activeFaceAtom = atom(face) as PrimitiveAtom<RecoderDetailFace>;
        this.workspaceIdAtom = atom(metaString(block, WorkspaceIdMetaKey)) as PrimitiveAtom<string>;
        this.childVersionAtom = atom(0) as PrimitiveAtom<number>;
    }

    get viewComponent(): ViewComponent {
        return RecoderDetailView;
    }

    navigate(target: RecoderDetailFace, workspaceId: string): void {
        const current = globalStore.get(this.activeFaceAtom);
        const id = workspaceId.trim();
        if (id == "") return;

        if (target == current) {
            if (id == globalStore.get(this.workspaceIdAtom)) return;
            if (target == "session") {
                this.session().switchWorkspace(id);
            } else {
                this.replaceReview(id);
            }
            globalStore.set(this.workspaceIdAtom, id);
            this.persistContext(target, id);
            return;
        }

        const outcome = resolveDetailNav({ activeFace: current }, target, id != "", false);
        const next = applyDetailNav({ activeFace: current }, outcome);
        if (outcome.kind != "switch") return;

        // Bind the destination before React mounts it. Child views can then run
        // their normal connect/refresh effects without briefly reading the
        // workspace from the face that was previously active.
        if (target == "session") {
            const terminal = this.session();
            terminal.boundWorkspaceId = id;
            globalStore.set(terminal.workspaceIdAtom, id);
        } else {
            this.replaceReview(id);
        }
        globalStore.set(this.workspaceIdAtom, id);
        globalStore.set(this.activeFaceAtom, next.activeFace);
        this.persistContext(next.activeFace, id);
    }

    session(): RecoderTerminalViewModel {
        if (this.terminalModel == null || this.terminalModel.disposed) {
            this.terminalModel = new RecoderTerminalViewModel(this.initOpts);
        }
        return this.terminalModel;
    }

    review(): RecoderDiffViewModel {
        if (this.diffModel == null) this.diffModel = new RecoderDiffViewModel(this.initOpts);
        return this.diffModel;
    }

    private replaceReview(workspaceId: string): void {
        this.diffModel = new RecoderDiffViewModel(this.initOpts);
        globalStore.set(this.diffModel.selectedIdAtom, workspaceId);
        globalStore.set(this.childVersionAtom, globalStore.get(this.childVersionAtom) + 1);
    }

    private persistContext(face: RecoderDetailFace, workspaceId: string): void {
        const block = globalStore.get(this.blockAtom);
        const meta = {
            ...(block?.meta ?? {}),
            [DetailFaceMetaKey]: face,
            [WorkspaceIdMetaKey]: workspaceId,
        } as MetaType;
        void this.initOpts.waveEnv.services.object.UpdateObjectMeta(`block:${this.blockId}`, meta).catch(() => {});
    }

    dispose(): void {
        this.terminalModel?.dispose();
        this.terminalModel = null;
        this.diffModel = null;
    }
}

export { RecoderDetailViewModel };
