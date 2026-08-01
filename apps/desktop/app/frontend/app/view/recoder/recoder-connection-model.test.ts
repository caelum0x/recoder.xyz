// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

import { globalStore } from "@/app/store/global";
import { DefaultStaleAfterMs, RecoderConnectionModel } from "./recoder-connection-model";

function freshModel(): RecoderConnectionModel {
    RecoderConnectionModel.resetInstance();
    return RecoderConnectionModel.getInstance();
}

describe("RecoderConnectionModel.connectionStateAtom", () => {
    afterEach(() => {
        RecoderConnectionModel.resetInstance();
    });

    it("starts offline before any poll has succeeded", () => {
        const model = freshModel();
        expect(globalStore.get(model.connectionStateAtom)).toBe("offline");
    });

    it("is live right after a successful refresh", () => {
        const model = freshModel();
        model.noteRefresh(true, 1000);
        expect(globalStore.get(model.connectionStateAtom)).toBe("live");
    });

    it("goes stale once the observed clock advances past the stale window", () => {
        const model = freshModel();
        model.noteRefresh(true, 1000);
        globalStore.set(model.nowAtom, 1000 + DefaultStaleAfterMs + 1);
        expect(globalStore.get(model.connectionStateAtom)).toBe("stale");
    });

    it("marks stale immediately when a poll fails but prior data is still shown", () => {
        const model = freshModel();
        model.noteRefresh(true, 1000);
        model.noteRefresh(false, 2000);
        expect(globalStore.get(model.connectionStateAtom)).toBe("stale");
    });

    it("stays offline when the first poll fails with no prior success", () => {
        const model = freshModel();
        model.noteRefresh(false, 1000);
        expect(globalStore.get(model.connectionStateAtom)).toBe("offline");
    });

    it("returns to live after a fresh success following a failure", () => {
        const model = freshModel();
        model.noteRefresh(true, 1000);
        model.noteRefresh(false, 2000);
        expect(globalStore.get(model.connectionStateAtom)).toBe("stale");
        model.noteRefresh(true, 3000);
        expect(globalStore.get(model.connectionStateAtom)).toBe("live");
    });
});
