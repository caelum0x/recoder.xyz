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
import { parseStreamFrame, reconnectDelayMs, RecoderTerminalViewModel } from "./recoder-terminal-model";

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

describe("reconnectDelayMs (capped backoff + jitter)", () => {
    it("stays within [ceiling/2, ceiling] where ceiling = min(15000, 500·2^attempt)", () => {
        const ceilings = [500, 1000, 2000, 4000, 8000, 15000, 15000, 15000];
        for (let attempt = 0; attempt < ceilings.length; attempt++) {
            const ceiling = ceilings[attempt];
            for (let s = 0; s < 50; s++) {
                const d = reconnectDelayMs(attempt);
                expect(d).toBeGreaterThanOrEqual(Math.floor(ceiling / 2));
                expect(d).toBeLessThanOrEqual(ceiling);
            }
        }
    });

    it("caps the ceiling at 15000ms for large attempts (no unbounded growth)", () => {
        for (let s = 0; s < 50; s++) {
            expect(reconnectDelayMs(20)).toBeLessThanOrEqual(15000);
        }
    });

    it("treats negative attempts as attempt 0 (defensive)", () => {
        const d = reconnectDelayMs(-3);
        expect(d).toBeGreaterThanOrEqual(250);
        expect(d).toBeLessThanOrEqual(500);
    });
});

describe("RecoderTerminalViewModel.entriesAtom (structured run stream)", () => {
    it("accumulates a classified descriptor entry per RunEvent", () => {
        const model = makeModel();
        model.handleMessage(JSON.stringify(BareLogEvent));
        const entries = globalStore.get(model.entriesAtom);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ kind: "event", descriptor: { label: "Log", severity: "info" } });
    });

    it("threads a decidable approvalId onto an approval_requested entry", () => {
        const model = makeModel();
        model.handleMessage(
            JSON.stringify({ ...BareLogEvent, type: "approval_requested", data: { approvalId: "appr-7" } })
        );
        const [entry] = globalStore.get(model.entriesAtom);
        expect(entry).toMatchObject({ kind: "event", descriptor: { label: "Needs approval", approvalId: "appr-7" } });
    });

    it("records stream error/complete as toned system entries", () => {
        const model = makeModel();
        model.handleMessage(JSON.stringify({ type: "error", message: "boom" }));
        model.handleMessage(JSON.stringify({ type: "complete" }));
        const entries = globalStore.get(model.entriesAtom);
        expect(entries[0]).toEqual({ kind: "system", text: "[stream error] boom", tone: "error" });
        expect(entries[1]).toEqual({ kind: "system", text: "[stream complete]", tone: "muted" });
    });
});
