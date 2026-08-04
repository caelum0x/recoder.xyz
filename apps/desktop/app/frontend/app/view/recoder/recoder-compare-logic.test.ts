// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
    fetchFileVersions,
    fileVersionsKey,
    mergeFileVersions,
    parseFileVersionsView,
    type FileVersionColumn,
    type FileVersionsFetchResult,
} from "./recoder-compare-logic";

function payload(overrides?: Record<string, unknown>) {
    return {
        path: "src/shared.ts",
        base: "export const base = 1\n",
        versions: [
            { workspaceId: "ws-a", agent: "claude", content: "export const a = 1\n" },
            { workspaceId: "ws-b", agent: "codex", content: "export const b = 2\n", truncated: true },
            { workspaceId: "ws-c", agent: "cursor", content: null, reason: "file not present in this sibling (deleted or never created)" },
            { workspaceId: "ws-d", agent: "pi", content: "" },
        ],
        ...overrides,
    };
}

describe("parseFileVersionsView — lenient projection of the backend payload", () => {
    it("projects base + per-sibling columns: content, null+reason, truncated, empty", () => {
        const view = parseFileVersionsView(payload());
        expect(view).not.toBeNull();
        expect(view.path).toBe("src/shared.ts");
        expect(view.hasBase).toBe(true);
        expect(view.base).toBe("export const base = 1\n");
        expect(view.baseTruncated).toBe(false);
        expect(view.versions.map((v: FileVersionColumn) => v.workspaceId)).toEqual(["ws-a", "ws-b", "ws-c", "ws-d"]);

        const a = view.versions[0];
        expect(a.hasContent).toBe(true);
        expect(a.content).toBe("export const a = 1\n");
        expect(a.reason).toBe("");
        expect(a.truncated).toBe(false);

        const b = view.versions[1];
        expect(b.hasContent).toBe(true);
        expect(b.truncated).toBe(true);

        // content:null stays DISTINCT from an empty file — a deletion carries its reason
        // and hasContent false, never rendered as blank/empty.
        const c = view.versions[2];
        expect(c.hasContent).toBe(false);
        expect(c.content).toBe("");
        expect(c.reason).toBe("file not present in this sibling (deleted or never created)");

        // A genuinely-empty file: present (hasContent true) with an empty string.
        const d = view.versions[3];
        expect(d.hasContent).toBe(true);
        expect(d.content).toBe("");
        expect(d.reason).toBe("");
    });

    it("supplies a truthful generic reason when the backend omits one for an absent column", () => {
        const view = parseFileVersionsView(payload({ versions: [{ workspaceId: "ws-x", agent: "claude", content: null }] }));
        expect(view.versions[0].hasContent).toBe(false);
        expect(view.versions[0].reason).toBe("not present in this sibling");
    });

    it("carries a truthful baseTruncated flag", () => {
        expect(parseFileVersionsView(payload({ baseTruncated: true })).baseTruncated).toBe(true);
    });

    it("reports a missing base as hasBase:false (null base — no worktree resolved), never a fabricated empty base", () => {
        const view = parseFileVersionsView(payload({ base: null }));
        expect(view.hasBase).toBe(false);
        expect(view.base).toBe("");
    });

    it("distinguishes a genuinely-empty base file (hasBase:true) from an absent one", () => {
        const view = parseFileVersionsView(payload({ base: "" }));
        expect(view.hasBase).toBe(true);
        expect(view.base).toBe("");
    });

    it("rejects unrecognized shapes (null) and skips version entries without a workspaceId", () => {
        expect(parseFileVersionsView(null)).toBeNull();
        expect(parseFileVersionsView("nope")).toBeNull();
        expect(parseFileVersionsView({ base: "x" })).toBeNull();
        expect(parseFileVersionsView({ path: "p", versions: "not-an-array" })).toBeNull();
        const view = parseFileVersionsView(payload({ versions: [{ agent: "claude", content: "x" }, { workspaceId: "ok", agent: "codex", content: "y" }] }));
        expect(view.versions.map((v: FileVersionColumn) => v.workspaceId)).toEqual(["ok"]);
    });
});

type StubResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

function stubFetch(response: StubResponse, seen?: { url?: string }): typeof fetch {
    return (async (url: unknown) => {
        if (seen != null) {
            seen.url = String(url);
        }
        return response;
    }) as unknown as typeof fetch;
}

describe("fetchFileVersions — request shaping, envelope unwrap + truthful degrade", () => {
    it("unwraps the { data: { fileVersions } } envelope and hits the file-versions edge with the path query", async () => {
        const seen: { url?: string } = {};
        const result = await fetchFileVersions(
            "grp 1",
            "src/shared.ts",
            stubFetch({ ok: true, status: 200, json: async () => ({ success: true, data: { fileVersions: payload() } }) }, seen)
        );
        expect(result.ok).toBe(true);
        expect(result.view.versions).toHaveLength(4);
        expect(seen.url).toContain("/api/conductor/workspaces/compare/grp%201/file-versions?path=src%2Fshared.ts");
    });

    it("tolerates a bare (un-enveloped) view body", async () => {
        const result = await fetchFileVersions(
            "grp",
            "src/shared.ts",
            stubFetch({ ok: true, status: 200, json: async () => payload() })
        );
        expect(result.ok).toBe(true);
        expect(result.view.path).toBe("src/shared.ts");
    });

    it("surfaces the backend's verbatim error reason on a non-2xx", async () => {
        const result = await fetchFileVersions(
            "grp",
            "src/shared.ts",
            stubFetch({
                ok: false,
                status: 404,
                json: async () => ({ error: { code: "NOT_FOUND", message: "workspace not found" } }),
            })
        );
        expect(result.ok).toBe(false);
        expect(result.error).toContain("workspace not found");
    });

    it("degrades truthfully on an unrecognized 2xx body and on an unreachable backend", async () => {
        const weird = await fetchFileVersions(
            "grp",
            "src/shared.ts",
            stubFetch({ ok: true, status: 200, json: async () => ({ data: { fileVersions: "garbage" } }) })
        );
        expect(weird.ok).toBe(false);
        expect(weird.error).toContain("unrecognized");

        const down = await fetchFileVersions("grp", "src/shared.ts", (async () => {
            throw new Error("ECONNREFUSED");
        }) as unknown as typeof fetch);
        expect(down.ok).toBe(false);
        expect(down.error).toContain("reachable");
    });

    it("rejects blank inputs before any fetch", async () => {
        const guard = (async () => {
            throw new Error("must not be called");
        }) as unknown as typeof fetch;
        expect((await fetchFileVersions("", "src/shared.ts", guard)).ok).toBe(false);
        expect((await fetchFileVersions("grp", "", guard)).ok).toBe(false);
    });
});

describe("mergeFileVersions — immutable keyed-by-path store", () => {
    const ok: FileVersionsFetchResult = { ok: true, view: parseFileVersionsView(payload()) };
    const err: FileVersionsFetchResult = { ok: false, error: "workspace not found" };

    it("stores a result under its path and leaves prior paths intact", () => {
        const one = mergeFileVersions({}, "a.ts", ok);
        const two = mergeFileVersions(one, "b.ts", err);
        expect(Object.keys(two).sort()).toEqual(["a.ts", "b.ts"]);
        expect(two["a.ts"].ok).toBe(true);
        expect(two["b.ts"].ok).toBe(false);
        // immutability: the earlier snapshot is not mutated in place.
        expect(one["b.ts"]).toBeUndefined();
    });

    it("keys by taskGroup+path so two groups' same-path files never collide", () => {
        const kA = fileVersionsKey("grp_a", "src/index.ts");
        const kB = fileVersionsKey("grp_b", "src/index.ts");
        expect(kA).not.toBe(kB);
        const store = mergeFileVersions(mergeFileVersions({}, kA, ok), kB, err);
        // Group A's cached file content is never read under group B's key.
        expect(store[kA].ok).toBe(true);
        expect(store[kB].ok).toBe(false);
    });

    it("overwrites the same path on a reload and keeps an error result (never silently dropped)", () => {
        const first = mergeFileVersions({}, "a.ts", err);
        expect(first["a.ts"].ok).toBe(false);
        const reloaded = mergeFileVersions(first, "a.ts", ok);
        expect(reloaded["a.ts"].ok).toBe(true);
    });

    it("tolerates a null current map (first write)", () => {
        const merged = mergeFileVersions(null as unknown as Record<string, FileVersionsFetchResult>, "a.ts", ok);
        expect(merged["a.ts"].ok).toBe(true);
    });
});
