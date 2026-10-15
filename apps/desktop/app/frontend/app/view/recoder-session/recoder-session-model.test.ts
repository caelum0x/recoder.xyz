// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-session", () => ({
    RecoderSessionView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { FakeRecoderSessionRpcClient } from "@recoder/t3-session-bridge/fake-client";
import { RecoderSessionViewModel } from "./recoder-session-model";

function makeModel(client: FakeRecoderSessionRpcClient): RecoderSessionViewModel {
    return new RecoderSessionViewModel({ blockId: "b1" } as ViewModelInitType, client);
}

describe("RecoderSessionViewModel", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("session-open: initialize() connects, lists threads, and opens the first thread's message stream", async () => {
        const client = new FakeRecoderSessionRpcClient({
            threads: [
                { id: "t1", projectId: "p1", title: "Fix the parser", status: "active", branch: "main", activeRunId: null, updatedAt: "2026-10-15T00:00:00.000Z" },
                { id: "t2", projectId: "p1", title: "Add tests", status: "idle", branch: null, activeRunId: null, updatedAt: "2026-10-14T00:00:00.000Z" },
            ],
            messagesByThread: {
                t1: [{ id: "m0", threadId: "t1", role: "user", text: "Fix the off-by-one in the tokenizer", streaming: false, createdAt: "2026-10-15T00:00:00.000Z" }],
            },
        });
        const model = makeModel(client);

        await model.initialize();

        expect(globalStore.get(model.statusAtom)).toBe("ready");
        expect(globalStore.get(model.threadsAtom)).toHaveLength(2);
        expect(globalStore.get(model.activeThreadIdAtom)).toBe("t1");
        expect(globalStore.get(model.messagesAtom)).toEqual([
            expect.objectContaining({ text: "Fix the off-by-one in the tokenizer" }),
        ]);
    });

    it("session-open: a connect() failure reports a truthful error status, never a silent success", async () => {
        const client = new FakeRecoderSessionRpcClient();
        vi.spyOn(client, "connect").mockRejectedValue(new Error("recoder server unreachable"));
        const model = makeModel(client);

        await model.initialize();

        expect(globalStore.get(model.statusAtom)).toBe("error");
        expect(globalStore.get(model.errorAtom)).toBe("recoder server unreachable");
    });

    it("message-stream: sendComposerMessage round-trips through the client and appends to the stream exactly once", async () => {
        const client = new FakeRecoderSessionRpcClient({
            threads: [{ id: "t1", projectId: "p1", title: "Fix the parser", status: "active", branch: "main", activeRunId: null, updatedAt: "2026-10-15T00:00:00.000Z" }],
        });
        const model = makeModel(client);
        await model.initialize();

        globalStore.set(model.composerTextAtom, "Please also add a regression test");
        await model.sendComposerMessage();

        expect(client.sentMessages).toEqual([{ threadId: "t1", text: "Please also add a regression test" }]);
        expect(globalStore.get(model.composerTextAtom)).toBe("");
        const messages = globalStore.get(model.messagesAtom);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ role: "user", text: "Please also add a regression test" });
    });

    it("message-stream: an assistant reply pushed by the server appears in the stream without a resend", async () => {
        const client = new FakeRecoderSessionRpcClient({
            threads: [{ id: "t1", projectId: "p1", title: "Fix the parser", status: "active", branch: "main", activeRunId: null, updatedAt: "2026-10-15T00:00:00.000Z" }],
        });
        const model = makeModel(client);
        await model.initialize();

        client.pushAssistantMessage("t1", "Fixed and added a regression test; diff is ready for review.");

        const messages = globalStore.get(model.messagesAtom);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ role: "assistant" });
    });

    it("message-stream: switching threads unsubscribes the old one — its late events never leak in", async () => {
        const client = new FakeRecoderSessionRpcClient({
            threads: [
                { id: "t1", projectId: "p1", title: "A", status: "active", branch: null, activeRunId: null, updatedAt: "2026-10-15T00:00:00.000Z" },
                { id: "t2", projectId: "p1", title: "B", status: "active", branch: null, activeRunId: null, updatedAt: "2026-10-15T00:00:00.000Z" },
            ],
        });
        const model = makeModel(client);
        await model.initialize();
        expect(globalStore.get(model.activeThreadIdAtom)).toBe("t1");

        await model.openThread("t2");
        expect(globalStore.get(model.activeThreadIdAtom)).toBe("t2");
        expect(globalStore.get(model.messagesAtom)).toEqual([]);

        // A message delivered to the now-unsubscribed t1 must not land in t2's stream.
        client.pushAssistantMessage("t1", "late reply on the old thread");
        expect(globalStore.get(model.messagesAtom)).toEqual([]);
    });

    it("diff-render: opening a thread loads its full-thread diff into diffAtom", async () => {
        const diff = { threadId: "t1", fromTurnCount: 0, toTurnCount: 3, diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new\n" };
        const client = new FakeRecoderSessionRpcClient({
            threads: [{ id: "t1", projectId: "p1", title: "Fix the parser", status: "active", branch: "main", activeRunId: null, updatedAt: "2026-10-15T00:00:00.000Z" }],
            diffsByThread: { t1: diff },
        });
        const model = makeModel(client);

        await model.initialize();

        expect(globalStore.get(model.diffAtom)).toEqual(diff);
    });

    it("diff-render: a thread with no diff yet renders the real empty-diff shape, not null-as-loading", async () => {
        const client = new FakeRecoderSessionRpcClient({
            threads: [{ id: "t1", projectId: "p1", title: "Fix the parser", status: "active", branch: "main", activeRunId: null, updatedAt: "2026-10-15T00:00:00.000Z" }],
        });
        const model = makeModel(client);

        await model.initialize();

        expect(globalStore.get(model.diffAtom)).toEqual({ threadId: "t1", fromTurnCount: 0, toTurnCount: 0, diff: "" });
    });

    it("dispose() unsubscribes the active thread and disconnects the client", async () => {
        const client = new FakeRecoderSessionRpcClient({
            threads: [{ id: "t1", projectId: "p1", title: "Fix the parser", status: "active", branch: "main", activeRunId: null, updatedAt: "2026-10-15T00:00:00.000Z" }],
        });
        const disconnectSpy = vi.spyOn(client, "disconnect");
        const model = makeModel(client);
        await model.initialize();

        model.dispose();
        expect(disconnectSpy).toHaveBeenCalledTimes(1);

        client.pushAssistantMessage("t1", "should not be observed after dispose");
        expect(globalStore.get(model.messagesAtom)).toHaveLength(0);
    });
});
