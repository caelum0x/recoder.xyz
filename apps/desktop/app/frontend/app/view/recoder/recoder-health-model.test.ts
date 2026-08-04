// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-endpoints", () => ({
    getRecoderBackendUrl: () => "http://backend.test",
}));

import { globalStore } from "@/app/store/global";
import { RecoderHealthModel } from "./recoder-health-model";

function jsonResponse(status: number, body: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function freshModel(): RecoderHealthModel {
    RecoderHealthModel.resetInstance();
    return RecoderHealthModel.getInstance();
}

describe("RecoderHealthModel", () => {
    afterEach(() => {
        RecoderHealthModel.resetInstance();
        vi.unstubAllGlobals();
    });

    it("starts in a neutral loading state (never up) before the first poll", () => {
        const model = freshModel();
        expect(globalStore.get(model.healthDotAtom).tone).not.toBe("up");
    });

    it("reads a healthy /health/full report as up", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(200, { status: "up", sources: [{ name: "conductor", status: "up" }] })
            )
        );
        const model = freshModel();
        await model.refresh();
        expect(globalStore.get(model.healthDotAtom).tone).toBe("up");
    });

    it("parses a 503 down report and names the down component", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(503, {
                    status: "down",
                    sources: [{ name: "engines", status: "down", reason: "sidecar unreachable" }],
                })
            )
        );
        const model = freshModel();
        await model.refresh();
        const dot = globalStore.get(model.healthDotAtom);
        expect(dot.tone).toBe("down");
        expect(dot.label).toContain("engines");
    });

    it("shows starting (never down) when the very first poll cannot reach the backend", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
        const model = freshModel();
        await model.refresh();
        const dot = globalStore.get(model.healthDotAtom);
        expect(dot.tone).not.toBe("up");
        expect(dot.label.toLowerCase()).toContain("starting");
    });

    it("degrades to down (never up) once a previously-healthy backend stops answering", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(200, { status: "up", sources: [] }))
            .mockRejectedValueOnce(new Error("socket hang up"));
        vi.stubGlobal("fetch", fetchMock);
        const model = freshModel();
        await model.refresh();
        expect(globalStore.get(model.healthDotAtom).tone).toBe("up");
        await model.refresh();
        const dot = globalStore.get(model.healthDotAtom);
        expect(dot.tone).toBe("down");
        expect(dot.tone).not.toBe("up");
    });
});
