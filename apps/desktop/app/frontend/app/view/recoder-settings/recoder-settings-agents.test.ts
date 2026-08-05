// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseDetectedAgents } from "./recoder-settings-agents";

describe("parseDetectedAgents", () => {
    it("humanizes the detected (available) coding agents from the runtimes envelope", () => {
        const body = {
            success: true,
            data: {
                runtimes: [
                    { runtimeId: "claude_code", available: true },
                    { runtimeId: "codex", available: true },
                ],
            },
        };
        expect(parseDetectedAgents(body)).toEqual([
            { runtimeId: "claude_code", label: "Claude Code" },
            { runtimeId: "codex", label: "Codex" },
        ]);
    });

    it("accepts a bare (unwrapped) body", () => {
        const body = { runtimes: [{ runtimeId: "cursor", available: true }] };
        expect(parseDetectedAgents(body)).toEqual([{ runtimeId: "cursor", label: "Cursor" }]);
    });

    it("drops agents that are not available (installed-but-detected only)", () => {
        const body = {
            data: {
                runtimes: [
                    { runtimeId: "claude_code", available: true },
                    { runtimeId: "codex", available: false },
                ],
            },
        };
        expect(parseDetectedAgents(body)).toEqual([{ runtimeId: "claude_code", label: "Claude Code" }]);
    });

    it("never surfaces the in-process engine (openfang) as a user-facing agent", () => {
        const body = {
            data: {
                runtimes: [
                    { runtimeId: "openfang", available: true },
                    { runtimeId: "pi", available: true },
                ],
            },
        };
        expect(parseDetectedAgents(body)).toEqual([{ runtimeId: "pi", label: "pi" }]);
    });

    it("de-duplicates repeated runtime ids in probe order", () => {
        const body = {
            data: {
                runtimes: [
                    { runtimeId: "claude_code", available: true },
                    { runtimeId: "claude_code", available: true },
                ],
            },
        };
        expect(parseDetectedAgents(body)).toEqual([{ runtimeId: "claude_code", label: "Claude Code" }]);
    });

    it("passes an unknown runtime id through unchanged rather than dropping it", () => {
        const body = { data: { runtimes: [{ runtimeId: "future_agent", available: true }] } };
        expect(parseDetectedAgents(body)).toEqual([{ runtimeId: "future_agent", label: "future_agent" }]);
    });

    it("skips malformed entries but keeps the valid ones", () => {
        const body = {
            data: {
                runtimes: [null, "junk", { available: true }, { runtimeId: "", available: true }, { runtimeId: "codex", available: true }],
            },
        };
        expect(parseDetectedAgents(body)).toEqual([{ runtimeId: "codex", label: "Codex" }]);
    });

    it("returns [] for a missing or malformed body (section then omits truthfully)", () => {
        expect(parseDetectedAgents(undefined)).toEqual([]);
        expect(parseDetectedAgents(null)).toEqual([]);
        expect(parseDetectedAgents("junk")).toEqual([]);
        expect(parseDetectedAgents({ data: { runtimes: "junk" } })).toEqual([]);
        expect(parseDetectedAgents({ data: {} })).toEqual([]);
    });
});
