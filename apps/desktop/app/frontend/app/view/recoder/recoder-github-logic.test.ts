// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
    filterClonableRepos,
    githubIdentityLabel,
    parseGithubRepos,
    parseGithubStatus,
} from "./recoder-github-logic";

describe("parseGithubStatus — token-free /github/status payload", () => {
    it("reads the connected identity", () => {
        const s = parseGithubStatus({
            connected: true,
            source: "gh_cli",
            account: { login: "caelum0x", name: "Arhan", email: "a@b.c" },
        });
        expect(s).toEqual({ connected: true, source: "gh_cli", login: "caelum0x", name: "Arhan", email: "a@b.c" });
    });

    it("reads a truthful not-connected status with a partial account", () => {
        const s = parseGithubStatus({ connected: false, source: null, account: { name: "Arhan" } });
        expect(s).toEqual({ connected: false, source: "", login: "", name: "Arhan", email: "" });
    });

    it("returns null (status unknown) for a non-object payload", () => {
        expect(parseGithubStatus(null)).toBeNull();
        expect(parseGithubStatus("nope")).toBeNull();
        expect(parseGithubStatus(undefined)).toBeNull();
    });

    it("never fabricates fields from malformed shapes", () => {
        const s = parseGithubStatus({ connected: "yes", source: 3, account: "caelum0x" });
        expect(s).toEqual({ connected: false, source: "", login: "", name: "", email: "" });
    });
});

describe("parseGithubRepos — { repos: [...] } from /github/repos", () => {
    it("parses well-formed entries", () => {
        const repos = parseGithubRepos({
            repos: [{ name: "recoder.xyz", nameWithOwner: "caelum0x/recoder.xyz", url: "https://github.com/caelum0x/recoder.xyz" }],
        });
        expect(repos).toEqual([
            { name: "recoder.xyz", nameWithOwner: "caelum0x/recoder.xyz", url: "https://github.com/caelum0x/recoder.xyz" },
        ]);
    });

    it("drops malformed entries and keeps the rest", () => {
        const repos = parseGithubRepos({
            repos: [
                null,
                "repo",
                { name: "", nameWithOwner: "o/r", url: "https://github.com/o/r" },
                { name: "r", nameWithOwner: "o/r" },
                { name: "keep", nameWithOwner: "o/keep", url: "https://github.com/o/keep" },
            ],
        });
        expect(repos).toEqual([{ name: "keep", nameWithOwner: "o/keep", url: "https://github.com/o/keep" }]);
    });

    it("yields [] for a malformed payload", () => {
        expect(parseGithubRepos(null)).toEqual([]);
        expect(parseGithubRepos({})).toEqual([]);
        expect(parseGithubRepos({ repos: "many" })).toEqual([]);
    });
});

describe("githubIdentityLabel", () => {
    it("prefers the gh login, falls back to the git name, else empty", () => {
        expect(githubIdentityLabel(parseGithubStatus({ connected: true, account: { login: "caelum0x", name: "Arhan" } }))).toBe("caelum0x");
        expect(githubIdentityLabel(parseGithubStatus({ connected: false, account: { name: "Arhan" } }))).toBe("Arhan");
        expect(githubIdentityLabel(parseGithubStatus({ connected: false }))).toBe("");
        expect(githubIdentityLabel(null)).toBe("");
    });
});

describe("filterClonableRepos — hide repos already cloned locally", () => {
    const repos = [
        { name: "recoder.xyz", nameWithOwner: "caelum0x/recoder.xyz", url: "https://github.com/caelum0x/recoder.xyz" },
        { name: "other", nameWithOwner: "caelum0x/other", url: "https://github.com/caelum0x/other" },
    ];

    it("drops repos whose name matches a recent folder leaf", () => {
        const out = filterClonableRepos(repos, ["/Users/dev/recoder/repos/recoder.xyz"]);
        expect(out.map((r) => r.name)).toEqual(["other"]);
    });

    it("keeps everything when recents are empty or unrelated (incl. trailing slash)", () => {
        expect(filterClonableRepos(repos, [])).toEqual(repos);
        expect(filterClonableRepos(repos, ["/Users/dev/unrelated/"])).toEqual(repos);
        expect(filterClonableRepos(repos, ["/Users/dev/other/"]).map((r) => r.name)).toEqual(["recoder.xyz"]);
    });
});
