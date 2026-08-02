// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-board", () => ({
    RecoderBoardView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { RecoderBoardViewModel } from "./recoder-board-model";

const ReadyUrl = "http://127.0.0.1:3100/api/agent-os/issues/ready";

function makeModel(): RecoderBoardViewModel {
    return new RecoderBoardViewModel({ blockId: "b1" } as ViewModelInitType);
}

function okJson(data: unknown) {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
}

// The signals feed loads alongside every refresh; serve it empty so tests only
// exercise the ready-list edge under scrutiny.
function stubFetch(readyImpl: () => Promise<unknown>) {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
            if (url === ReadyUrl) {
                return readyImpl();
            }
            return okJson({ signals: [] });
        })
    );
}

describe("RecoderBoardViewModel.refresh — stale-gate wiring", () => {
    beforeEach(() => {
        RecoderConnectionModel.resetInstance();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        RecoderConnectionModel.resetInstance();
    });

    it("a successful ready-list read notes the shared connection live", async () => {
        stubFetch(() => okJson({ ready: [{ id: "i1", title: "t", priority: "1" }] }));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.statusAtom)).toBe("ok");
        expect(globalStore.get(RecoderConnectionModel.getInstance().connectionStateAtom)).toBe("live");
    });

    it("a 404 (route not mounted) is not-available for the view but LIVE for the connection", async () => {
        stubFetch(() => Promise.resolve({ ok: false, status: 404, json: async () => ({}) }));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.statusAtom)).toBe("not-available");
        expect(globalStore.get(RecoderConnectionModel.getInstance().connectionStateAtom)).toBe("live");
    });

    it("a non-2xx after a success flips the shared state to stale", async () => {
        const model = makeModel();
        stubFetch(() => okJson({ ready: [] }));
        await model.refresh();

        stubFetch(() => Promise.resolve({ ok: false, status: 503, json: async () => ({}) }));
        await model.refresh();

        expect(globalStore.get(model.statusAtom)).toBe("not-connected");
        expect(globalStore.get(RecoderConnectionModel.getInstance().connectionStateAtom)).toBe("stale");
    });

    it("a transport failure with no prior success reads offline", async () => {
        stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.statusAtom)).toBe("not-connected");
        expect(globalStore.get(RecoderConnectionModel.getInstance().connectionStateAtom)).toBe("offline");
    });
});
