// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-locks", () => ({
    RecoderLocksView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderLocksViewModel } from "./recoder-locks-model";

const LocksUrl = "http://127.0.0.1:3100/api/agent-os/locks";

function makeModel(): RecoderLocksViewModel {
    return new RecoderLocksViewModel({ blockId: "b1" } as ViewModelInitType);
}

// Wrap a bare `{ locks }` payload in the sendSuccess envelope the edge returns.
function okLocks(locks: unknown) {
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { locks } }),
    });
}

describe("RecoderLocksViewModel.refresh", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects active locks sorted by path with holder/mode/task/expiry", async () => {
        const wire = [
            {
                id: "l2",
                resourcePath: "src/z.ts",
                holderAgentId: "agent-b",
                taskId: "t-9",
                mode: "shared",
                acquiredAt: "2026-08-11T10:00:00.000Z",
                expiresAt: "2026-08-11T22:00:00.000Z",
            },
            {
                id: "l1",
                resourcePath: "src/a.ts",
                holderAgentId: "agent-a",
                taskId: "t-1",
                mode: "exclusive",
                acquiredAt: "2026-08-11T09:00:00.000Z",
                expiresAt: "2026-08-11T21:00:00.000Z",
            },
        ];
        const fetchMock = okLocks(wire);
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(fetchMock).toHaveBeenCalledWith(LocksUrl);
        expect(globalStore.get(model.locksAtom)).toEqual([
            {
                id: "l1",
                path: "src/a.ts",
                holder: "agent-a",
                taskId: "t-1",
                mode: "exclusive",
                expiresAt: "2026-08-11T21:00:00.000Z",
            },
            {
                id: "l2",
                path: "src/z.ts",
                holder: "agent-b",
                taskId: "t-9",
                mode: "shared",
                expiresAt: "2026-08-11T22:00:00.000Z",
            },
        ]);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.noticeAtom)).toBe("");
    });

    it("preserves an exclusive vs shared mode distinction and drops a fabricated pathless lock", async () => {
        const wire = [
            { id: "l1", resourcePath: "a", holderAgentId: "h1", mode: "exclusive", expiresAt: "2026-08-11T21:00:00.000Z" },
            { id: "l2", resourcePath: "", holderAgentId: "h2", mode: "shared", expiresAt: "2026-08-11T21:00:00.000Z" },
            { id: "l3", resourcePath: "b", holderAgentId: "", mode: "shared", expiresAt: "2026-08-11T21:00:00.000Z" },
        ];
        vi.stubGlobal("fetch", okLocks(wire));

        const model = makeModel();
        await model.refresh();

        const locks = globalStore.get(model.locksAtom);
        expect(locks).toHaveLength(1);
        expect(locks[0]).toEqual({
            id: "l1",
            path: "a",
            holder: "h1",
            mode: "exclusive",
            expiresAt: "2026-08-11T21:00:00.000Z",
        });
    });

    it("shows a truthful 'No active work locks' notice and no rows when the edge returns none", async () => {
        vi.stubGlobal("fetch", okLocks([]));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.locksAtom)).toEqual([]);
        expect(globalStore.get(model.noticeAtom)).toBe("No active work locks");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("degrades to the backend reason (no fabricated rows) on a non-2xx", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                json: async () => ({ error: { message: "not permitted" } }),
            })
        );

        const model = makeModel();
        globalStore.set(model.locksAtom, [
            { id: "stale", path: "p", holder: "h", mode: "exclusive", expiresAt: "x" },
        ]);
        await model.refresh();

        expect(globalStore.get(model.locksAtom)).toEqual([]);
        expect(globalStore.get(model.errorAtom)).toBe("not permitted");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.locksAtom)).toEqual([]);
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });
});
