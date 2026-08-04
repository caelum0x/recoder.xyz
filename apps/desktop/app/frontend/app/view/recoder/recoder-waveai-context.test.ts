// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { RecoderWorkspace } from "./recoder-board-logic";
import {
    buildWorkspaceAIContext,
    formatChangedFileLines,
    MaxContextFiles,
    shouldAttachWorkspaceContext,
    workspaceCodename,
    workspaceContextIndicatorLabel,
    WorkspaceContextLabel,
    workspaceContextMessageText,
    type WorkspaceContextFile,
} from "./recoder-waveai-context";

function makeWorkspace(overrides: Partial<RecoderWorkspace> = {}): RecoderWorkspace {
    return {
        workspaceId: "ws-1",
        branch: "recoder/fix-auth",
        runtimeId: "claude_code",
        worktreePath: "/tmp/wt",
        state: "running",
        projectId: "acme-api",
        ...overrides,
    } as RecoderWorkspace;
}

describe("workspaceCodename", () => {
    it("prefers the task title, then the branch, then the id", () => {
        expect(workspaceCodename(makeWorkspace({ metadata: { title: "Fix auth" } }))).toBe("Fix auth");
        expect(workspaceCodename(makeWorkspace())).toBe("recoder/fix-auth");
        expect(workspaceCodename(makeWorkspace({ branch: "", metadata: { title: "  " } }))).toBe("ws-1");
    });
});

describe("buildWorkspaceAIContext", () => {
    it("composes the full block when every read model is present", () => {
        const ctx = buildWorkspaceAIContext({
            workspace: makeWorkspace(),
            diffSummary: { additions: 12, deletions: 3, files: 2 },
            diffFiles: [
                { path: "src/auth.ts", insertions: 10, deletions: 2 },
                { path: "src/session.ts", insertions: 2, deletions: 1 },
            ],
        });
        expect(ctx).not.toBeNull();
        expect(ctx.workspaceId).toBe("ws-1");
        expect(ctx.codename).toBe("recoder/fix-auth");
        expect(ctx.text).toBe(
            [
                "The user is looking at Recoder workspace recoder/fix-auth " +
                    "(repo acme-api, branch recoder/fix-auth, agent Claude Code, state running).",
                "Files changed (2):",
                "- src/auth.ts (+10/-2)",
                "- src/session.ts (+2/-1)",
            ].join("\n")
        );
    });

    it("omits absent facts instead of fabricating them", () => {
        const ctx = buildWorkspaceAIContext({
            workspace: makeWorkspace({ projectId: undefined, runtimeId: "", state: "" }),
        });
        expect(ctx.text).toBe("The user is looking at Recoder workspace recoder/fix-auth (branch recoder/fix-auth).");
        expect(ctx.text).not.toContain("repo");
        expect(ctx.text).not.toContain("Files changed");
    });

    it("falls back to the aggregate summary when the per-file list is unavailable", () => {
        const ctx = buildWorkspaceAIContext({
            workspace: makeWorkspace(),
            diffSummary: { additions: 5, deletions: 1, files: 3 },
            diffFiles: null,
        });
        expect(ctx.text).toContain("Files changed: 3 (+5/-1).");
    });

    it("returns null when there is no workspace to describe", () => {
        expect(buildWorkspaceAIContext({ workspace: null })).toBeNull();
        expect(buildWorkspaceAIContext({})).toBeNull();
        expect(buildWorkspaceAIContext({ workspace: makeWorkspace({ workspaceId: "" }) })).toBeNull();
    });

    it("shows a bare path for binary files instead of fabricated counts", () => {
        const ctx = buildWorkspaceAIContext({
            workspace: makeWorkspace(),
            diffFiles: [{ path: "logo.png", insertions: null, deletions: null }],
        });
        expect(ctx.text).toContain("- logo.png");
        expect(ctx.text).not.toContain("logo.png (");
    });
});

describe("formatChangedFileLines", () => {
    it("caps the list at MaxContextFiles with a truthful overflow line", () => {
        const files: WorkspaceContextFile[] = Array.from({ length: MaxContextFiles + 5 }, (_, i) => ({
            path: `f${i}.ts`,
            insertions: 1,
            deletions: 0,
        }));
        const lines = formatChangedFileLines(files);
        expect(lines[0]).toBe(`Files changed (${MaxContextFiles + 5}):`);
        expect(lines).toHaveLength(1 + MaxContextFiles + 1);
        expect(lines[lines.length - 1]).toBe("- …and 5 more");
    });

    it("yields nothing for an absent/empty/pathless list", () => {
        expect(formatChangedFileLines(null)).toEqual([]);
        expect(formatChangedFileLines([])).toEqual([]);
        expect(formatChangedFileLines([{ insertions: 1, deletions: 1 }])).toEqual([]);
    });
});

describe("shouldAttachWorkspaceContext", () => {
    const ctx = { workspaceId: "ws-1", codename: "cn", text: "t" };

    it("attaches once per conversation AND workspace (key = chatId::workspaceId)", () => {
        expect(shouldAttachWorkspaceContext("", "chat-1", false, ctx)).toBe(true);
        expect(shouldAttachWorkspaceContext("chat-1::ws-1", "chat-1", false, ctx)).toBe(false);
        expect(shouldAttachWorkspaceContext("chat-1::ws-1", "chat-2", false, ctx)).toBe(true);
        // Switching workspaces re-attaches once — the indicator never promises
        // a context that would not be sent.
        expect(shouldAttachWorkspaceContext("chat-1::ws-OTHER", "chat-1", false, ctx)).toBe(true);
    });

    it("never attaches when detached, contextless, or chatless", () => {
        expect(shouldAttachWorkspaceContext(null, "chat-1", true, ctx)).toBe(false);
        expect(shouldAttachWorkspaceContext(null, "chat-1", false, null)).toBe(false);
        expect(shouldAttachWorkspaceContext(null, "", false, ctx)).toBe(false);
        expect(shouldAttachWorkspaceContext(null, null, false, ctx)).toBe(false);
    });
});

describe("workspaceContextMessageText", () => {
    it("prefixes the block with the explicit attach label", () => {
        const text = workspaceContextMessageText({ workspaceId: "ws-1", codename: "cn", text: "body" });
        expect(text).toBe(`${WorkspaceContextLabel}\nbody`);
    });
});

describe("workspaceContextIndicatorLabel", () => {
    it("shows the codename while attached and an off state while detached", () => {
        const ctx = { workspaceId: "ws-1", codename: "recoder/fix-auth", text: "t" };
        expect(workspaceContextIndicatorLabel(ctx, false)).toBe("context: recoder/fix-auth");
        expect(workspaceContextIndicatorLabel(ctx, true)).toBe("context: off");
        expect(workspaceContextIndicatorLabel(null, false)).toBe("");
        expect(workspaceContextIndicatorLabel(null, true)).toBe("");
    });
});
