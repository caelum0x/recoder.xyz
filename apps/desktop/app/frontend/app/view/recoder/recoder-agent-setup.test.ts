// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { AGENT_INSTALL_GUIDES, copyToClipboard } from "./recoder-agent-setup";
import { AGENT_LABELS } from "./recoder-agent-labels";

describe("AGENT_INSTALL_GUIDES", () => {
    it("lists supported agents whose runtimeId has a friendly label", () => {
        expect(AGENT_INSTALL_GUIDES.length).toBeGreaterThan(0);
        for (const guide of AGENT_INSTALL_GUIDES) {
            expect(AGENT_LABELS[guide.runtimeId]).toBeDefined();
        }
    });

    it("every guide carries a non-empty install command and an https docs url", () => {
        for (const guide of AGENT_INSTALL_GUIDES) {
            expect(guide.command.trim().length).toBeGreaterThan(0);
            expect(guide.docsUrl).toMatch(/^https:\/\//);
        }
    });

    it("has no duplicate runtimeIds", () => {
        const ids = AGENT_INSTALL_GUIDES.map((g) => g.runtimeId);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("copyToClipboard", () => {
    it("returns false when navigator.clipboard.writeText is unavailable (no false success)", async () => {
        // The default test env has no DOM clipboard; the write must degrade to
        // false so the UI never shows a fabricated "Copied".
        await expect(copyToClipboard("npm install -g x")).resolves.toBe(false);
    });
});
