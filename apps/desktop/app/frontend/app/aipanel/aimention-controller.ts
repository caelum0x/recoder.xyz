// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Jotai/RpcApi wiring for the "@file" mention popup. Resolves the mention
// root from the focused block's cwd (the same "cmd:cwd" meta the terminal's
// own "File Browser" context-menu item already uses), lists files over
// FileListCommand, and hands a chosen file to WaveAIModel's existing
// addFileFromRemoteUri so the attach path matches a manual file drop.

import { getFocusedBlockId } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { formatRemoteUri } from "@/util/waveutil";
import * as jotai from "jotai";
import {
    detectActiveMention,
    filterMentionEntries,
    insertMention,
    type MentionFileEntry,
    type MentionTrigger,
} from "./aimention";
import {
    collectWorkspaceFiles,
    DefaultMentionWalkLimits,
    type ListDirFn,
    type MentionDirEntry,
} from "./aimention-filewalker";

export interface MentionPopupState {
    active: boolean;
    triggerStart: number;
    query: string;
    results: MentionFileEntry[];
    selectedIndex: number;
    loading: boolean;
}

const EmptyMentionState: MentionPopupState = {
    active: false,
    triggerStart: -1,
    query: "",
    results: [],
    selectedIndex: 0,
    loading: false,
};

export type AddMentionedFileFn = (entry: MentionFileEntry, connection: string) => Promise<void>;

async function rpcListDir(dirPath: string, connection: string): Promise<MentionDirEntry[]> {
    const infos = await RpcApi.FileListCommand(TabRpcClient, { path: formatRemoteUri(dirPath, connection) }, null);
    return (infos ?? [])
        .filter((info) => info?.path != null && !info.notfound)
        .map((info) => ({
            name: info.name ?? info.path.split("/").pop() ?? info.path,
            path: info.path,
            isDir: info.isdir === true,
        }));
}

export class AIMentionController {
    stateAtom: jotai.PrimitiveAtom<MentionPopupState> = jotai.atom(
        EmptyMentionState
    ) as jotai.PrimitiveAtom<MentionPopupState>;
    private fileCache: { rootKey: string; entries: MentionFileEntry[] } | null = null;
    private addMentionedFile: AddMentionedFileFn;

    constructor(addMentionedFile: AddMentionedFileFn) {
        this.addMentionedFile = addMentionedFile;
    }

    private resolveRoot(): { rootPath: string; connection: string } {
        const blockId = getFocusedBlockId();
        if (blockId == null || blockId === "") return null;
        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId));
        const blockData = globalStore.get(blockAtom);
        const rootPath = blockData?.meta?.["cmd:cwd"];
        if (rootPath == null || rootPath === "") return null;
        return { rootPath, connection: blockData?.meta?.connection ?? "local" };
    }

    private async ensureFileCache(rootPath: string, connection: string): Promise<MentionFileEntry[]> {
        const rootKey = `${connection}:${rootPath}`;
        if (this.fileCache?.rootKey === rootKey) {
            return this.fileCache.entries;
        }
        const listDir: ListDirFn = (dirPath) => rpcListDir(dirPath, connection);
        const entries = await collectWorkspaceFiles(rootPath, listDir, DefaultMentionWalkLimits);
        this.fileCache = { rootKey, entries };
        return entries;
    }

    // Call on every composer keystroke/caret move. Opens the popup (loading
    // the file list once per root) or re-filters the cached list in place.
    onInputChanged(text: string, cursorPos: number): void {
        const trigger = detectActiveMention(text, cursorPos);
        if (trigger == null) {
            this.close();
            return;
        }
        const current = globalStore.get(this.stateAtom);
        if (!current.active) {
            void this.open(trigger);
            return;
        }
        globalStore.set(this.stateAtom, {
            ...current,
            triggerStart: trigger.triggerStart,
            query: trigger.query,
            results: filterMentionEntries(this.fileCache?.entries ?? [], trigger.query),
            selectedIndex: 0,
        });
    }

    private async open(trigger: MentionTrigger): Promise<void> {
        const root = this.resolveRoot();
        if (root == null) {
            this.close();
            return;
        }
        globalStore.set(this.stateAtom, {
            active: true,
            triggerStart: trigger.triggerStart,
            query: trigger.query,
            results: [],
            selectedIndex: 0,
            loading: true,
        });
        try {
            const entries = await this.ensureFileCache(root.rootPath, root.connection);
            const current = globalStore.get(this.stateAtom);
            // The trigger may have closed/moved on while the walk was in flight.
            if (!current.active || current.triggerStart !== trigger.triggerStart) return;
            globalStore.set(this.stateAtom, {
                ...current,
                results: filterMentionEntries(entries, current.query),
                loading: false,
            });
        } catch {
            this.close();
        }
    }

    close(): void {
        if (globalStore.get(this.stateAtom).active) {
            globalStore.set(this.stateAtom, EmptyMentionState);
        }
    }

    moveSelection(delta: number): void {
        const current = globalStore.get(this.stateAtom);
        if (!current.active || current.results.length === 0) return;
        const nextIndex = (current.selectedIndex + delta + current.results.length) % current.results.length;
        globalStore.set(this.stateAtom, { ...current, selectedIndex: nextIndex });
    }

    setSelectionIndex(index: number): void {
        const current = globalStore.get(this.stateAtom);
        if (!current.active || index < 0 || index >= current.results.length) return;
        globalStore.set(this.stateAtom, { ...current, selectedIndex: index });
    }

    getSelectedEntry(): MentionFileEntry {
        const current = globalStore.get(this.stateAtom);
        if (!current.active || current.results.length === 0) return null;
        return current.results[current.selectedIndex] ?? null;
    }

    // Returns the composer text/cursor after inserting the mention and kicks
    // off the (async, fire-and-forget from the caller's perspective) file
    // attach. Safe to call even if the popup state has already been closed.
    applySelection(text: string, entry: MentionFileEntry): { text: string; cursorPos: number } {
        const current = globalStore.get(this.stateAtom);
        const triggerStart = current.active ? current.triggerStart : text.length;
        const cursorPos = current.active ? current.triggerStart + 1 + current.query.length : text.length;
        const result = insertMention(text, triggerStart, cursorPos, entry.relPath);
        const connection = this.resolveRoot()?.connection ?? "local";
        void this.addMentionedFile(entry, connection);
        this.close();
        return result;
    }
}
