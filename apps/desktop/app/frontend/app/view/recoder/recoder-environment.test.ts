// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseEnvironmentImport } from "./recoder-model";

describe("parseEnvironmentImport", () => {
    it("parses a full valid payload", () => {
        expect(
            parseEnvironmentImport({
                gitIdentity: { name: "Ada", email: "ada@x.io" },
                agentConfigs: [
                    { id: "claude_code", present: true },
                    { id: "codex", present: false },
                ],
                ghAuthenticated: true,
                shell: "zsh",
            })
        ).toEqual({
            gitIdentity: { name: "Ada", email: "ada@x.io" },
            agentConfigs: [
                { id: "claude_code", present: true },
                { id: "codex", present: false },
            ],
            ghAuthenticated: true,
            shell: "zsh",
        });
    });

    it("degrades a non-object payload to safe defaults (never throws)", () => {
        for (const bad of [null, "nope", 42, undefined]) {
            expect(parseEnvironmentImport(bad)).toEqual({
                gitIdentity: null,
                agentConfigs: [],
                ghAuthenticated: null,
                shell: "",
            });
        }
    });

    it("nulls a git identity with neither name nor email, and coerces gh/shell", () => {
        const parsed = parseEnvironmentImport({ gitIdentity: { name: "", email: "" }, ghAuthenticated: "yes", shell: 7 });
        expect(parsed.gitIdentity).toBeNull();
        expect(parsed.ghAuthenticated).toBeNull();
        expect(parsed.shell).toBe("");
    });

    it("drops malformed agent-config rows", () => {
        const parsed = parseEnvironmentImport({ agentConfigs: [null, "x", { present: true }, { id: "codex" }] });
        expect(parsed.agentConfigs).toEqual([{ id: "codex", present: false }]);
    });
});
