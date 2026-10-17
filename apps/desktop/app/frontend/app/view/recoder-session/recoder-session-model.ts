// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import type {
    RecoderSessionRpcClient,
    SessionDiffResult,
    SessionMessage,
    SessionThreadSummary,
} from "@recoder/t3-session-bridge";
import { defaultRecoderSessionSocketUrl, EffectRecoderSessionRpcClient } from "@recoder/t3-session-bridge";
import { RecoderSessionView } from "./recoder-session";

// Mirrors the board/diff models' degrade-safe status vocabulary (see
// recoder-board-model.ts): the view always renders a truthful state, never a
// silent "AI is working" placeholder (per .claude/rules/frontend.md).
export type RecoderSessionStatus = "idle" | "connecting" | "ready" | "error";

class RecoderSessionViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;

    readonly client: RecoderSessionRpcClient;

    threadsAtom: PrimitiveAtom<readonly SessionThreadSummary[]>;
    activeThreadIdAtom: PrimitiveAtom<string | null>;
    messagesAtom: PrimitiveAtom<readonly SessionMessage[]>;
    composerTextAtom: PrimitiveAtom<string>;
    diffAtom: PrimitiveAtom<SessionDiffResult | null>;
    statusAtom: PrimitiveAtom<RecoderSessionStatus>;
    errorAtom: PrimitiveAtom<string | null>;

    #unsubscribeThread: (() => void) | null = null;
    #seenMessageIds = new Set<string>();

    constructor(initOpts: ViewModelInitType, client?: RecoderSessionRpcClient) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-session";
        this.viewIcon = atom("messages");
        this.viewName = atom("Session");
        this.client = client ?? new EffectRecoderSessionRpcClient({ socketUrl: defaultRecoderSessionSocketUrl() });

        this.threadsAtom = atom([]) as PrimitiveAtom<readonly SessionThreadSummary[]>;
        this.activeThreadIdAtom = atom(null) as PrimitiveAtom<string | null>;
        this.messagesAtom = atom([]) as PrimitiveAtom<readonly SessionMessage[]>;
        this.composerTextAtom = atom("") as PrimitiveAtom<string>;
        this.diffAtom = atom(null) as PrimitiveAtom<SessionDiffResult | null>;
        this.statusAtom = atom("idle") as PrimitiveAtom<RecoderSessionStatus>;
        this.errorAtom = atom(null) as PrimitiveAtom<string | null>;
    }

    get viewComponent(): ViewComponent {
        return RecoderSessionView;
    }

    /** Connects, lists threads, and opens the first one. Called by the view on mount. */
    async initialize(): Promise<void> {
        globalStore.set(this.statusAtom, "connecting");
        try {
            await this.client.connect();
            const threads = await this.client.listThreads();
            globalStore.set(this.threadsAtom, threads);
            globalStore.set(this.statusAtom, "ready");
            const [first] = threads;
            if (first !== undefined) await this.openThread(first.id);
        } catch (error) {
            globalStore.set(this.statusAtom, "error");
            globalStore.set(this.errorAtom, errorMessage(error));
        }
    }

    /** Switches the Session view to a different thread's sidebar entry. */
    async openThread(threadId: string): Promise<void> {
        this.#unsubscribeThread?.();
        this.#unsubscribeThread = null;
        this.#seenMessageIds = new Set();
        globalStore.set(this.activeThreadIdAtom, threadId);
        globalStore.set(this.messagesAtom, []);
        globalStore.set(this.diffAtom, null);

        this.#unsubscribeThread = this.client.subscribeThread(threadId, (item) => {
            if (item.kind === "snapshot") {
                this.#seenMessageIds = new Set(item.messages.map((message) => message.id));
                globalStore.set(this.messagesAtom, item.messages);
            } else if (item.kind === "message") {
                if (this.#seenMessageIds.has(item.message.id)) return;
                this.#seenMessageIds.add(item.message.id);
                globalStore.set(this.messagesAtom, [...globalStore.get(this.messagesAtom), item.message]);
            }
        });

        await this.refreshDiff();
    }

    /** Re-fetches the Review panel's full-thread diff for the active thread. */
    async refreshDiff(): Promise<void> {
        const threadId = globalStore.get(this.activeThreadIdAtom);
        if (threadId == null) return;
        try {
            const diff = await this.client.getFullThreadDiff(threadId);
            globalStore.set(this.diffAtom, diff);
        } catch (error) {
            globalStore.set(this.errorAtom, errorMessage(error));
        }
    }

    /** Sends the composer's current text as a new message on the active thread, then clears it. */
    async sendComposerMessage(): Promise<void> {
        const threadId = globalStore.get(this.activeThreadIdAtom);
        const text = globalStore.get(this.composerTextAtom).trim();
        if (threadId == null || text === "") return;
        globalStore.set(this.composerTextAtom, "");
        try {
            await this.client.sendMessage({ threadId, text });
        } catch (error) {
            globalStore.set(this.errorAtom, errorMessage(error));
        }
    }

    dispose(): void {
        this.#unsubscribeThread?.();
        this.#unsubscribeThread = null;
        void this.client.disconnect();
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export { RecoderSessionViewModel };
