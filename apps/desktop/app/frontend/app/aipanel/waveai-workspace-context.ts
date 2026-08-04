// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Glue between the Wave AI panel and the Recoder board: find the board's
// most-recently-selected workspace and fold its already-loaded read models into
// the context block the panel attaches once per conversation. Everything here
// is dependency-injected (block models, atom getter, fetch) so it stays pure
// enough to unit test; WaveAIModel supplies the real globalStore/fetch.

import type { RecoderDiffSummary, RecoderWorkspace } from "@/app/view/recoder/recoder-board-logic";
import {
    buildWorkspaceAIContext,
    type WorkspaceAIContext,
    type WorkspaceContextFile,
} from "@/app/view/recoder/recoder-waveai-context";
import type { Atom } from "jotai";

// Structural view of RecoderViewModel — READ-ONLY: the panel only ever gets
// atom values. Every field optional so an older/leaner board model degrades to
// "no context" instead of a type break (recoder-model.ts is owned elsewhere).
type RecoderBoardModelLike = {
    viewType?: string;
    selectedWorkspaceIdAtom?: Atom<string>;
    combinedWorkspacesAtom?: Atom<RecoderWorkspace[]>;
    diffSummariesAtom?: Atom<Record<string, RecoderDiffSummary>>;
};

type BlockComponentModelLike = { viewModel?: RecoderBoardModelLike };

type AtomGetter = <T>(a: Atom<T>) => T;

// Minimal structural fetch (real fetch satisfies it) — `typeof fetch` would
// drag in Node's `preconnect` static and break the injected test doubles.
type FetchLike = (input: string) => Promise<{ ok: boolean; json: () => Promise<any> }>;

// The first Recoder board block that has a workspace selected — the board
// tracks "most recently selected" in selectedWorkspaceIdAtom (keyboard nav,
// row clicks, notification clicks), so that atom IS the focused-workspace seam.
// null when no board is open or nothing is selected: the panel then attaches
// nothing rather than guessing a workspace.
function pickRecoderBoardModel(models: BlockComponentModelLike[], get: AtomGetter): RecoderBoardModelLike {
    for (const bcm of models ?? []) {
        const vm = bcm?.viewModel;
        if (vm?.viewType != "recoder" || vm.selectedWorkspaceIdAtom == null) {
            continue;
        }
        if (get(vm.selectedWorkspaceIdAtom) != "") {
            return vm;
        }
    }
    return null;
}

// One-shot read of the per-file diff list (the same edge the board folds its
// aggregate summary from). null on any failure/unavailable diff — the context
// then falls back to the aggregate summary or omits the section.
async function fetchWorkspaceDiffFiles(
    baseUrl: string,
    workspaceId: string,
    fetchFn: FetchLike
): Promise<WorkspaceContextFile[]> {
    try {
        const res = await fetchFn(`${baseUrl}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/diff/files`);
        if (!res.ok) {
            return null;
        }
        const data = (await res.json())?.data;
        if (data?.available !== true || !Array.isArray(data.files)) {
            return null;
        }
        return data.files as WorkspaceContextFile[];
    } catch {
        return null;
    }
}

// Assemble the candidate context for the selected workspace. Each source
// degrades on its own: no board/selection/record ⇒ null, no diff data ⇒ the
// block simply omits its files section.
async function gatherWorkspaceContext(
    models: BlockComponentModelLike[],
    get: AtomGetter,
    fetchDiffFiles: (workspaceId: string) => Promise<WorkspaceContextFile[]>
): Promise<WorkspaceAIContext> {
    const board = pickRecoderBoardModel(models, get);
    if (board == null) {
        return null;
    }
    const workspaceId = get(board.selectedWorkspaceIdAtom);
    const workspaces = board.combinedWorkspacesAtom != null ? get(board.combinedWorkspacesAtom) : [];
    const workspace = (workspaces ?? []).find((ws) => ws?.workspaceId == workspaceId);
    if (workspace == null) {
        return null;
    }
    const summaries = board.diffSummariesAtom != null ? get(board.diffSummariesAtom) : {};
    const diffFiles = await fetchDiffFiles(workspaceId);
    return buildWorkspaceAIContext({ workspace, diffSummary: summaries?.[workspaceId], diffFiles });
}

export {
    fetchWorkspaceDiffFiles,
    gatherWorkspaceContext,
    pickRecoderBoardModel,
    type BlockComponentModelLike,
    type RecoderBoardModelLike,
};
