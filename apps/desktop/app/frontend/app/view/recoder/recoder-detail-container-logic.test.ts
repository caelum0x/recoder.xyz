// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { applyDetailNav, resolveDetailNav, type DetailContainerState } from "./recoder-detail-container-logic";

const sessionActive: DetailContainerState = { activeFace: "session" };

describe("resolveDetailNav — pop-out container navigation (PW3-9)", () => {
    it("switches Session → Review when a workspace is bound", () => {
        expect(resolveDetailNav(sessionActive, "review", true, false)).toEqual({ kind: "switch", face: "review" });
    });

    it("no-ops on the already-current face with a truthful reason", () => {
        const out = resolveDetailNav(sessionActive, "session", true, false);
        expect(out.kind).toBe("noop");
        expect(out).toMatchObject({ reason: expect.stringContaining("current view") });
    });

    it("no-ops with 'no workspace bound' when nothing is loaded — never fabricates a face", () => {
        const out = resolveDetailNav(sessionActive, "review", false, false);
        expect(out.kind).toBe("noop");
        expect(out).toMatchObject({ reason: expect.stringContaining("No workspace") });
    });

    it("pops the raw terminal OUT (never an in-container face) when a tmux session is attachable", () => {
        expect(resolveDetailNav(sessionActive, "terminal", true, true)).toEqual({ kind: "popout-terminal" });
    });

    it("no-ops terminal with a truthful reason when no tmux session is attached", () => {
        const out = resolveDetailNav(sessionActive, "terminal", true, false);
        expect(out.kind).toBe("noop");
        expect(out).toMatchObject({ reason: expect.stringContaining("tmux") });
    });

    it("no-ops an unknown target", () => {
        // @ts-expect-error — exercising the defensive branch with an off-contract id
        expect(resolveDetailNav(sessionActive, "nope", true, true)).toEqual({ kind: "noop", reason: "Unknown view" });
    });
});

describe("applyDetailNav — immutable reducer", () => {
    it("returns a NEW state on a real switch", () => {
        const next = applyDetailNav(sessionActive, { kind: "switch", face: "review" });
        expect(next).toEqual({ activeFace: "review" });
        expect(next).not.toBe(sessionActive);
    });

    it("returns the SAME reference on a noop or pop-out (no needless re-render)", () => {
        expect(applyDetailNav(sessionActive, { kind: "noop", reason: "x" })).toBe(sessionActive);
        expect(applyDetailNav(sessionActive, { kind: "popout-terminal" })).toBe(sessionActive);
    });
});
