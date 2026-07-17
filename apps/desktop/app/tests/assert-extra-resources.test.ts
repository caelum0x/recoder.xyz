// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const AppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { assertExtraResourcesExist } = require(path.join(AppRoot, "build/assert-extra-resources.cjs"));

describe("extraResources fail-loud gate", () => {
    let fixtureRoot: string;

    beforeAll(() => {
        fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "extra-resources-gate-"));
        fs.mkdirSync(path.join(fixtureRoot, "some-dir"));
        fs.writeFileSync(path.join(fixtureRoot, "some-dir/artifact.node"), "");
    });

    afterAll(() => {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    });

    it("passes and returns resolved paths when every source exists", () => {
        const verified = assertExtraResourcesExist(
            [{ from: "some-dir", to: "dir" }, { from: "some-dir/artifact.node", to: "native/a.node" }, "some-dir"],
            fixtureRoot
        );
        expect(verified).toHaveLength(3);
        expect(verified[1]).toBe(path.join(fixtureRoot, "some-dir/artifact.node"));
    });

    it("throws listing every missing source, not just the first", () => {
        const entries = [
            { from: "some-dir", to: "dir" },
            { from: "missing/one.node", to: "native/one.node" },
            { from: "missing/two", to: "two" },
        ];
        expect(() => assertExtraResourcesExist(entries, fixtureRoot)).toThrowError(/2 missing source path\(s\)/);
        expect(() => assertExtraResourcesExist(entries, fixtureRoot)).toThrowError(/missing\/one\.node/);
        expect(() => assertExtraResourcesExist(entries, fixtureRoot)).toThrowError(/missing\/two/);
    });

    it("rejects malformed entries with no 'from'", () => {
        expect(() => assertExtraResourcesExist([{ to: "somewhere" }], fixtureRoot)).toThrowError(/no 'from'/);
    });

    it("rejects a non-array extraResources value", () => {
        expect(() => assertExtraResourcesExist(undefined, fixtureRoot)).toThrowError(/expected an array/);
    });

    describe("electron-builder config wiring", () => {
        const config = require(path.join(AppRoot, "electron-builder.config.cjs"));

        it("registers a beforePack hook", () => {
            expect(typeof config.beforePack).toBe("function");
        });

        it("the gate names the tensorzero napi artifact when engine sources are absent", () => {
            // Resolving the real extraResources against an empty root makes every
            // source missing — the thrown list must include the release .node the
            // packaged backend loads in-process (the previously-silent failure).
            expect(() => assertExtraResourcesExist(config.extraResources, fixtureRoot)).toThrowError(
                /tensorzero\/crates\/target\/release\/tensorzero_gateway_napi\.node/
            );
        });

        it("bundles the owned beads bd where the backend resolver looks, and the gate covers it", () => {
            // beads-bin.ts resolves <resources>/backend/engines/beads/bin/bd in
            // packaged mode; the source is the LOCAL go build (never committed —
            // >100MB, stripped from git history), so the gate must name it (with
            // the build hint) when it is missing.
            const entry = config.extraResources.find(
                (e: { from?: string }) => typeof e === "object" && e?.from === "../server/engines/beads/bin/bd"
            );
            expect(entry).toBeDefined();
            expect(entry.to).toBe("backend/engines/beads/bin/bd");
            expect(() => assertExtraResourcesExist(config.extraResources, fixtureRoot)).toThrowError(
                /server\/engines\/beads\/bin\/bd/
            );
            expect(() => assertExtraResourcesExist(config.extraResources, fixtureRoot)).toThrowError(
                /go build -o bin\/bd \.\/cmd\/bd/
            );
        });

        it("release .node sources are release paths — no debug fallback", () => {
            const nodeSources = config.extraResources
                .map((e: { from?: string }) => e.from ?? "")
                .filter((from: string) => from.endsWith(".node"));
            expect(nodeSources.length).toBeGreaterThan(0);
            for (const from of nodeSources) {
                expect(from).toContain("/release/");
                expect(from).not.toContain("/debug/");
            }
        });
    });
});
