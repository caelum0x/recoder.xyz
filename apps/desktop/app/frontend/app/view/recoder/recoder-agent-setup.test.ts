// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import type { AgentAuthState } from "./recoder-agent-auth";
import {
    AGENT_INSTALL_GUIDES,
    agentSetupGuidance,
    copyToClipboard,
    deriveAgentSetupRows,
    extraLaunchableCount,
    requestAgentRescan,
} from "./recoder-agent-setup";
import { AGENT_LABELS } from "./recoder-agent-labels";

const SUPPORTED = ["claude_code", "codex", "opencode", "cursor", "gemini_cli"] as const;

function rowFor(
    runtimeId: string,
    agents: { runtimeId: string; available: boolean }[],
    agentAuth: Record<string, AgentAuthState>
) {
    return deriveAgentSetupRows(agents, agentAuth).find((r) => r.runtimeId == runtimeId)!;
}

describe("AGENT_INSTALL_GUIDES", () => {
    it("covers every supported first-run agent, each with a friendly label", () => {
        const ids = AGENT_INSTALL_GUIDES.map((g) => g.runtimeId);
        for (const id of SUPPORTED) {
            expect(ids).toContain(id);
            expect(AGENT_LABELS[id]).toBeDefined();
        }
    });

    it("leads with Claude Code so the zero-agent fastest path highlights it", () => {
        expect(AGENT_INSTALL_GUIDES[0].runtimeId).toBe("claude_code");
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

describe("deriveAgentSetupRows", () => {
    it("returns one row per supported agent regardless of what the backend enumerated", () => {
        const rows = deriveAgentSetupRows([], {});
        expect(rows.map((r) => r.runtimeId)).toEqual(AGENT_INSTALL_GUIDES.map((g) => g.runtimeId));
    });

    it("not-installed → install step (never a fabricated ready)", () => {
        const rows = deriveAgentSetupRows([], {});
        for (const row of rows) {
            expect(row.step).toBe("install");
            expect(row.badge).toBe("not installed");
        }
    });

    it("installed but login unverified → sign-in step (honest, never ready)", () => {
        const agents = [{ runtimeId: "claude_code", available: true }];
        const row = rowFor("claude_code", agents, {});
        expect(row.step).toBe("sign-in");
        expect(row.badge).toBe("detected");
        expect(row.login?.loginCommand).toBe("claude");
    });

    it("installed and known-signed-out → sign-in step", () => {
        const agents = [{ runtimeId: "codex", available: true }];
        const row = rowFor("codex", agents, { codex: "unauthenticated" });
        expect(row.step).toBe("sign-in");
        expect(row.badge).toBe("sign-in needed");
    });

    it("installed and confirmed login → ready step", () => {
        const agents = [{ runtimeId: "claude_code", available: true }];
        const row = rowFor("claude_code", agents, { claude_code: "authenticated" });
        expect(row.step).toBe("ready");
        expect(row.badge).toBe("ready");
    });

    it("an auth verdict on an uninstalled agent stays install (PATH is the gate)", () => {
        const row = rowFor("codex", [], { codex: "authenticated" });
        expect(row.step).toBe("install");
    });
});

describe("agentSetupGuidance", () => {
    it("zero installed → zeroReady with Claude Code as the fastest path", () => {
        const rows = deriveAgentSetupRows([], {});
        const guidance = agentSetupGuidance(rows);
        expect(guidance.zeroReady).toBe(true);
        expect(guidance.launchableCount).toBe(0);
        expect(guidance.fastestPath?.runtimeId).toBe("claude_code");
    });

    it("one installed agent (even unverified) clears the zero-ready guidance", () => {
        const rows = deriveAgentSetupRows([{ runtimeId: "opencode", available: true }], {});
        const guidance = agentSetupGuidance(rows);
        expect(guidance.zeroReady).toBe(false);
        expect(guidance.launchableCount).toBe(1);
        expect(guidance.fastestPath).toBeNull();
    });

    it("an off-guide launchable agent (windsurf/replit) is NOT falsely told 'you need an agent'", () => {
        // No guide agent installed, but the backend enumerates a launchable one.
        const rows = deriveAgentSetupRows([], {});
        const guidance = agentSetupGuidance(rows, extraLaunchableCount([{ runtimeId: "windsurf", available: true }]));
        expect(guidance.zeroReady).toBe(false);
        expect(guidance.launchableCount).toBe(1);
    });
});

describe("requestAgentRescan", () => {
    it("delegates to the model's re-probe exactly once", () => {
        const rescanAgents = vi.fn().mockResolvedValue(undefined);
        requestAgentRescan({ rescanAgents });
        expect(rescanAgents).toHaveBeenCalledTimes(1);
    });
});

describe("copyToClipboard", () => {
    it("returns false when navigator.clipboard.writeText is unavailable (no false success)", async () => {
        // The default test env has no DOM clipboard; the write must degrade to
        // false so the UI never shows a fabricated "Copied".
        await expect(copyToClipboard("npm install -g x")).resolves.toBe(false);
    });
});
