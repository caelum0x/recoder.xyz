// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-terminal", () => ({
    RecoderTerminalView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { atom } from "jotai";
import { parseStreamFrame, RecoderTerminalViewModel } from "./recoder-terminal-model";

const BareLogEvent = {
    eventId: "e1",
    type: "log",
    taskId: "t1",
    message: "hello from the agent",
    createdAt: "2026-07-25T12:00:00.000Z",
};

function makeModel(): RecoderTerminalViewModel {
    const initOpts = {
        blockId: "b1",
        waveEnv: { wos: { getWaveObjectAtom: () => atom({} as Block) } },
    } as unknown as ViewModelInitType;
    return new RecoderTerminalViewModel(initOpts);
}

describe("parseStreamFrame", () => {
    it("accepts a bare RunEvent frame (the live /stream shape)", () => {
        expect(parseStreamFrame(JSON.stringify(BareLogEvent))).toEqual({ kind: "event", event: BareLogEvent });
    });

    it("accepts every bare RunEventType including terminal states", () => {
        const types = [
            "started",
            "state_transition",
            "log",
            "user_message",
            "artifact",
            "needs_input",
            "verified",
            "approval_requested",
            "handoff",
            "failed",
            "completed",
        ];
        for (const type of types) {
            const frame = parseStreamFrame(JSON.stringify({ ...BareLogEvent, type }));
            expect(frame).toEqual({ kind: "event", event: { ...BareLogEvent, type } });
        }
    });

    it("still accepts the legacy wrapped event envelope", () => {
        const raw = JSON.stringify({ type: "event", event: BareLogEvent });
        expect(parseStreamFrame(raw)).toEqual({ kind: "event", event: BareLogEvent });
    });

    it("maps the legacy error envelope with a truthful default message", () => {
        expect(parseStreamFrame(JSON.stringify({ type: "error", message: "boom" }))).toEqual({
            kind: "error",
            message: "boom",
        });
        expect(parseStreamFrame(JSON.stringify({ type: "error" }))).toEqual({ kind: "error", message: "stream error" });
    });

    it("maps the legacy complete envelope", () => {
        expect(parseStreamFrame(JSON.stringify({ type: "complete" }))).toEqual({ kind: "complete" });
    });

    it("rejects non-strings, invalid JSON, non-objects, and unknown types", () => {
        expect(parseStreamFrame(42)).toBeNull();
        expect(parseStreamFrame("not json")).toBeNull();
        expect(parseStreamFrame(JSON.stringify("just a string"))).toBeNull();
        expect(parseStreamFrame(JSON.stringify(null))).toBeNull();
        expect(parseStreamFrame(JSON.stringify({}))).toBeNull();
        expect(parseStreamFrame(JSON.stringify({ type: "mystery" }))).toBeNull();
    });
});

describe("RecoderTerminalViewModel.handleMessage", () => {
    it("renders a bare RunEvent as a scrollback line", () => {
        const model = makeModel();
        model.handleMessage(JSON.stringify(BareLogEvent));
        const lines = globalStore.get(model.linesAtom);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain("log");
        expect(lines[0]).toContain("hello from the agent");
    });

    it("renders a bare completed event as a line without touching connection state", () => {
        const model = makeModel();
        globalStore.set(model.statusAtom, "connected");
        model.handleMessage(JSON.stringify({ ...BareLogEvent, type: "completed", message: "run done" }));
        const lines = globalStore.get(model.linesAtom);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain("completed");
        expect(globalStore.get(model.statusAtom)).toBe("connected");
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("still renders legacy wrapped frames", () => {
        const model = makeModel();
        model.handleMessage(JSON.stringify({ type: "event", event: BareLogEvent }));
        model.handleMessage(JSON.stringify({ type: "error", message: "boom" }));
        model.handleMessage(JSON.stringify({ type: "complete" }));
        const lines = globalStore.get(model.linesAtom);
        expect(lines).toHaveLength(3);
        expect(lines[0]).toContain("hello from the agent");
        expect(lines[1]).toBe("[stream error] boom");
        expect(lines[2]).toBe("[stream complete]");
        expect(globalStore.get(model.errorAtom)).toBe("boom");
    });

    it("silently drops undecodable frames", () => {
        const model = makeModel();
        model.handleMessage("not json");
        model.handleMessage(JSON.stringify({ type: "mystery" }));
        expect(globalStore.get(model.linesAtom)).toHaveLength(0);
    });
});
