// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { deriveHealthDot } from "./recoder-health-logic";

describe("deriveHealthDot", () => {
    it("maps a fully-up report to the up tone", () => {
        const dot = deriveHealthDot({
            kind: "payload",
            body: { status: "up", sources: [{ name: "conductor", status: "up", degraded: false }] },
        });
        expect(dot.tone).toBe("up");
    });

    it("maps a degraded report to the degraded tone and names the impaired component", () => {
        const dot = deriveHealthDot({
            kind: "payload",
            body: {
                status: "degraded",
                sources: [
                    { name: "engines", status: "degraded", reason: "sidecar slow" },
                    { name: "conductor", status: "up" },
                ],
            },
        });
        expect(dot.tone).toBe("degraded");
        expect(dot.label).toContain("engines");
    });

    it("maps a down report to the down tone and names the down component", () => {
        const dot = deriveHealthDot({
            kind: "payload",
            body: { status: "down", sources: [{ name: "engines", status: "down", reason: "unreachable" }] },
        });
        expect(dot.tone).toBe("down");
        expect(dot.label).toContain("engines");
    });

    it("treats a never-connected unreachable poll as a distinct starting state, not healthy", () => {
        const dot = deriveHealthDot({ kind: "unreachable", everConnected: false });
        expect(dot.tone).not.toBe("up");
        expect(dot.tone).not.toBe("down");
        expect(dot.label.toLowerCase()).toContain("starting");
    });

    it("maps an unreachable backend that was previously up to down — never up", () => {
        const dot = deriveHealthDot({ kind: "unreachable", everConnected: true, reason: "ECONNREFUSED" });
        expect(dot.tone).toBe("down");
        expect(dot.tone).not.toBe("up");
        expect(dot.label).toContain("ECONNREFUSED");
    });

    it("shows a neutral (non-up, non-down) dot while the first probe is loading", () => {
        const dot = deriveHealthDot({ kind: "loading" });
        expect(dot.tone).not.toBe("up");
        expect(dot.tone).not.toBe("down");
    });

    it("maps an unknown rollup status to degraded, never up", () => {
        const dot = deriveHealthDot({ kind: "payload", body: { status: "unknown", sources: [] } });
        expect(dot.tone).toBe("degraded");
    });

    it("never fabricates up from a malformed body", () => {
        expect(deriveHealthDot({ kind: "payload", body: null }).tone).not.toBe("up");
        expect(deriveHealthDot({ kind: "payload", body: { nope: 1 } }).tone).not.toBe("up");
    });

    it("unwraps a sendSuccess-enveloped payload defensively", () => {
        const dot = deriveHealthDot({ kind: "payload", body: { data: { status: "up", sources: [] } } });
        expect(dot.tone).toBe("up");
    });
});
