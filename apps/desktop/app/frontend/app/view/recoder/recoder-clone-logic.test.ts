// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { deriveGitHubUrl, isGitHubRepoUrl, parseCloneResponse, repoNameFromUrl } from "./recoder-clone-logic";

describe("isGitHubRepoUrl — mirror of the clone edge's INVALID_INPUT gate", () => {
    it("accepts the https form with and without .git and a trailing slash", () => {
        expect(isGitHubRepoUrl("https://github.com/owner/repo")).toBe(true);
        expect(isGitHubRepoUrl("https://github.com/owner/repo.git")).toBe(true);
        expect(isGitHubRepoUrl("https://github.com/owner/repo/")).toBe(true);
        expect(isGitHubRepoUrl("  https://github.com/owner/repo  ")).toBe(true);
        expect(isGitHubRepoUrl("https://github.com/caelum0x/recoder.xyz")).toBe(true);
    });

    it("accepts the SSH form", () => {
        expect(isGitHubRepoUrl("git@github.com:owner/repo.git")).toBe(true);
        expect(isGitHubRepoUrl("git@github.com:owner/repo")).toBe(true);
    });

    it("rejects non-GitHub and non-repo URLs", () => {
        expect(isGitHubRepoUrl("")).toBe(false);
        expect(isGitHubRepoUrl("https://gitlab.com/owner/repo")).toBe(false);
        expect(isGitHubRepoUrl("http://github.com/owner/repo")).toBe(false);
        expect(isGitHubRepoUrl("https://github.com/owner")).toBe(false);
        expect(isGitHubRepoUrl("https://github.com/owner/repo/tree/main")).toBe(false);
        expect(isGitHubRepoUrl("git@github.com:owner")).toBe(false);
        expect(isGitHubRepoUrl("/Users/dev/projects/repo")).toBe(false);
        expect(isGitHubRepoUrl("owner/repo")).toBe(false);
        expect(isGitHubRepoUrl("https://github.com/owner/..")).toBe(false);
        expect(isGitHubRepoUrl("https://evil.com/https://github.com/owner/repo")).toBe(false);
    });
});

describe("repoNameFromUrl — mirrors the backend's destDir/<repo-name> leaf", () => {
    it("strips .git and reads both forms", () => {
        expect(repoNameFromUrl("https://github.com/owner/repo.git")).toBe("repo");
        expect(repoNameFromUrl("https://github.com/owner/repo/")).toBe("repo");
        expect(repoNameFromUrl("git@github.com:owner/my-repo.git")).toBe("my-repo");
        expect(repoNameFromUrl("https://github.com/caelum0x/recoder.xyz")).toBe("recoder.xyz");
    });

    it("yields empty for anything invalid", () => {
        expect(repoNameFromUrl("/Users/dev/projects/repo")).toBe("");
        expect(repoNameFromUrl("")).toBe("");
    });
});

describe("deriveGitHubUrl — only obviously-derivable entries, never guessed", () => {
    it("canonicalizes entries that are already GitHub URLs", () => {
        expect(deriveGitHubUrl("https://github.com/owner/repo.git")).toBe("https://github.com/owner/repo");
        expect(deriveGitHubUrl("git@github.com:owner/repo.git")).toBe("https://github.com/owner/repo");
    });

    it("yields empty for local folder paths (the recent-repos store shape)", () => {
        expect(deriveGitHubUrl("/Users/dev/recoder/repos/repo")).toBe("");
        expect(deriveGitHubUrl("C:\\dev\\repo")).toBe("");
        expect(deriveGitHubUrl("")).toBe("");
    });
});

describe("parseCloneResponse — truthful envelope parse", () => {
    it("parses a 200 success with repoPath + clonedWith", () => {
        expect(
            parseCloneResponse(200, { success: true, data: { repoPath: "/home/u/recoder/repos/repo", clonedWith: "gh" } })
        ).toEqual({ ok: true, repoPath: "/home/u/recoder/repos/repo", clonedWith: "gh" });
        expect(
            parseCloneResponse(200, { success: true, data: { repoPath: "/r/repo", clonedWith: "git" } })
        ).toEqual({ ok: true, repoPath: "/r/repo", clonedWith: "git" });
    });

    it("drops an unrecognized clonedWith but keeps the real repoPath", () => {
        expect(parseCloneResponse(200, { success: true, data: { repoPath: "/r/repo", clonedWith: "curl" } })).toEqual({
            ok: true,
            repoPath: "/r/repo",
        });
    });

    it("treats a 200 without a usable repoPath as a failure — never opens a fabricated folder", () => {
        const parsed = parseCloneResponse(200, { success: true, data: {} });
        expect(parsed.ok).toBe(false);
        expect(parsed.error).toContain("no folder");
        expect(parseCloneResponse(200, { success: true, data: { repoPath: "  " } }).ok).toBe(false);
        expect(parseCloneResponse(200, null).ok).toBe(false);
    });

    it("prefers the backend's own error message on any failure status", () => {
        expect(
            parseCloneResponse(409, { success: false, error: { message: "target already exists and is not empty" } })
        ).toEqual({ ok: false, error: "target already exists and is not empty" });
        expect(parseCloneResponse(400, { success: false, error: "bad url" })).toEqual({ ok: false, error: "bad url" });
    });

    it("falls back to status-scoped truthful lines when the body carries no reason", () => {
        expect(parseCloneResponse(400, {}).error).toContain("GitHub repository URL");
        expect(parseCloneResponse(409, {}).error).toContain("already exists");
        expect(parseCloneResponse(503, {}).error).toContain("gh");
        expect(parseCloneResponse(500, null).error).toBe("Clone failed (HTTP 500).");
    });
});
