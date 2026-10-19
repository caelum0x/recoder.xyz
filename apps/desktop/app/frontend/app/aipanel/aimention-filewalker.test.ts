// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { collectWorkspaceFiles, type ListDirFn, type MentionDirEntry } from "./aimention-filewalker";

function fakeFs(tree: Record<string, MentionDirEntry[]>): ListDirFn {
    return async (dirPath: string) => tree[dirPath] ?? [];
}

describe("collectWorkspaceFiles", () => {
    it("walks nested directories and returns relative paths sorted alphabetically", async () => {
        const listDir = fakeFs({
            "/root": [
                { name: "src", path: "/root/src", isDir: true },
                { name: "README.md", path: "/root/README.md", isDir: false },
            ],
            "/root/src": [
                { name: "foo.ts", path: "/root/src/foo.ts", isDir: false },
                { name: "bar.ts", path: "/root/src/bar.ts", isDir: false },
            ],
        });

        const entries = await collectWorkspaceFiles("/root", listDir);
        expect(entries.map((e) => e.relPath)).toEqual(["README.md", "src/bar.ts", "src/foo.ts"]);
        expect(entries.find((e) => e.relPath === "src/foo.ts")).toEqual({
            relPath: "src/foo.ts",
            absPath: "/root/src/foo.ts",
            dirPath: "/root/src",
        });
    });

    it("skips ignored directories like node_modules and .git", async () => {
        const listDir = fakeFs({
            "/root": [
                { name: "node_modules", path: "/root/node_modules", isDir: true },
                { name: ".git", path: "/root/.git", isDir: true },
                { name: "src", path: "/root/src", isDir: true },
            ],
            "/root/src": [{ name: "index.ts", path: "/root/src/index.ts", isDir: false }],
            "/root/node_modules": [{ name: "pkg", path: "/root/node_modules/pkg", isDir: true }],
        });

        const entries = await collectWorkspaceFiles("/root", listDir);
        expect(entries.map((e) => e.relPath)).toEqual(["src/index.ts"]);
    });

    it("stops once the file cap is hit", async () => {
        const manyFiles: MentionDirEntry[] = Array.from({ length: 10 }, (_, i) => ({
            name: `f${i}.ts`,
            path: `/root/f${i}.ts`,
            isDir: false,
        }));
        const listDir = fakeFs({ "/root": manyFiles });

        const entries = await collectWorkspaceFiles("/root", listDir, {
            maxFiles: 3,
            maxDirsVisited: 10,
            maxDepth: 5,
        });
        expect(entries).toHaveLength(3);
    });

    it("stops descending past maxDepth", async () => {
        const listDir = fakeFs({
            "/root": [{ name: "a", path: "/root/a", isDir: true }],
            "/root/a": [{ name: "b", path: "/root/a/b", isDir: true }],
            "/root/a/b": [{ name: "deep.ts", path: "/root/a/b/deep.ts", isDir: false }],
        });

        const entries = await collectWorkspaceFiles("/root", listDir, {
            maxFiles: 100,
            maxDirsVisited: 100,
            maxDepth: 1,
        });
        expect(entries).toEqual([]);
    });

    it("treats a listDir failure as an empty directory instead of aborting the walk", async () => {
        const listDir: ListDirFn = async (dirPath) => {
            if (dirPath === "/root/broken") {
                throw new Error("permission denied");
            }
            if (dirPath === "/root") {
                return [
                    { name: "broken", path: "/root/broken", isDir: true },
                    { name: "ok.ts", path: "/root/ok.ts", isDir: false },
                ];
            }
            return [];
        };

        const entries = await collectWorkspaceFiles("/root", listDir);
        expect(entries.map((e) => e.relPath)).toEqual(["ok.ts"]);
    });
});
