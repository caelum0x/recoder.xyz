// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockBlockState = vi.hoisted(() => {
    let focusedBlockId = "block-1";
    let blockMeta: Record<string, any> = { "cmd:cwd": "/root", connection: "local" };
    return {
        getFocusedBlockId: () => focusedBlockId,
        setFocusedBlockId: (id: string) => {
            focusedBlockId = id;
        },
        getBlockMeta: () => blockMeta,
        setBlockMeta: (meta: Record<string, any>) => {
            blockMeta = meta;
        },
    };
});

vi.mock("@/app/store/global", () => ({
    getFocusedBlockId: mockBlockState.getFocusedBlockId,
}));

vi.mock("@/app/store/jotaiStore", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("@/app/store/wos", async () => {
    const { atom } = await import("jotai");
    return {
        makeORef: (otype: string, oid: string) => `${otype}:${oid}`,
        getWaveObjectAtom: () => atom({ meta: mockBlockState.getBlockMeta() }),
    };
});

vi.mock("@/app/store/wshrpcutil", () => ({
    TabRpcClient: {},
}));

vi.mock("@/app/store/wshclientapi", () => ({
    RpcApi: {
        FileListCommand: vi.fn(),
    },
}));

import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { AIMentionController } from "./aimention-controller";

const fileListMock = RpcApi.FileListCommand as ReturnType<typeof vi.fn>;

function fileInfo(name: string, path: string, isdir = false) {
    return { name, path, isdir };
}

beforeEach(() => {
    mockBlockState.setFocusedBlockId("block-1");
    mockBlockState.setBlockMeta({ "cmd:cwd": "/root", connection: "local" });
    fileListMock.mockReset();
    fileListMock.mockImplementation(async (_client: unknown, { path }: { path: string }) => {
        if (path === "wsh://local//root") {
            return [fileInfo("src", "/root/src", true), fileInfo("README.md", "/root/README.md")];
        }
        if (path === "wsh://local//root/src") {
            return [fileInfo("foo.ts", "/root/src/foo.ts"), fileInfo("bar.ts", "/root/src/bar.ts")];
        }
        return [];
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("AIMentionController", () => {
    it("stays closed when the composer has no active @ mention", () => {
        const controller = new AIMentionController(vi.fn());
        controller.onInputChanged("just talking", 5);
        expect(globalStore.get(controller.stateAtom).active).toBe(false);
    });

    it("opens, walks the focused block's cwd, and lists matching files", async () => {
        const controller = new AIMentionController(vi.fn());
        controller.onInputChanged("@foo", 4);
        await vi.waitFor(() => expect(globalStore.get(controller.stateAtom).loading).toBe(false));

        const state = globalStore.get(controller.stateAtom);
        expect(state.active).toBe(true);
        expect(state.results.map((r) => r.relPath)).toEqual(["src/foo.ts"]);
    });

    it("closes without opening a popup when there is no focused block", async () => {
        mockBlockState.setFocusedBlockId("");
        const controller = new AIMentionController(vi.fn());
        controller.onInputChanged("@foo", 4);
        await Promise.resolve();
        expect(globalStore.get(controller.stateAtom).active).toBe(false);
    });

    it("re-filters the cached list in place as the query changes, without re-walking the filesystem", async () => {
        const controller = new AIMentionController(vi.fn());
        controller.onInputChanged("@f", 2);
        await vi.waitFor(() => expect(globalStore.get(controller.stateAtom).loading).toBe(false));
        const callsAfterOpen = fileListMock.mock.calls.length;

        controller.onInputChanged("@foo", 4);
        expect(globalStore.get(controller.stateAtom).results.map((r) => r.relPath)).toEqual(["src/foo.ts"]);
        expect(fileListMock.mock.calls.length).toBe(callsAfterOpen);
    });

    it("applySelection inserts the mention text and attaches the file via the injected callback", async () => {
        const addMentioned = vi.fn().mockResolvedValue(undefined);
        const controller = new AIMentionController(addMentioned);
        controller.onInputChanged("@foo", 4);
        await vi.waitFor(() => expect(globalStore.get(controller.stateAtom).loading).toBe(false));

        const entry = controller.getSelectedEntry();
        expect(entry?.relPath).toBe("src/foo.ts");

        const result = controller.applySelection("@foo", entry);
        expect(result.text).toBe("@src/foo.ts ");
        expect(addMentioned).toHaveBeenCalledWith(entry, "local");
        expect(globalStore.get(controller.stateAtom).active).toBe(false);
    });

    it("moveSelection wraps around the result list", async () => {
        const controller = new AIMentionController(vi.fn());
        controller.onInputChanged("@", 1);
        await vi.waitFor(() => expect(globalStore.get(controller.stateAtom).loading).toBe(false));

        const resultCount = globalStore.get(controller.stateAtom).results.length;
        expect(resultCount).toBeGreaterThan(1);
        controller.moveSelection(-1);
        expect(globalStore.get(controller.stateAtom).selectedIndex).toBe(resultCount - 1);
    });
});
