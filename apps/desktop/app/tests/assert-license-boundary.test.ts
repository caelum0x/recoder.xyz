// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const AppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
    assertRestrictedEngineInputs,
    assertRestrictedEnginesAbsentFromArtifact,
    scanFileForMarkers,
    writeLicenseBoundaryEvidence,
} = require(path.join(AppRoot, "build/assert-license-boundary.cjs"));

describe("desktop distribution license boundary", () => {
    let fixtureRoot: string;
    let appRoot: string;

    beforeEach(() => {
        fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-license-boundary-"));
        appRoot = path.join(fixtureRoot, "apps/desktop/app");
        fs.mkdirSync(path.join(appRoot, "dist"), { recursive: true });
        fs.mkdirSync(path.join(fixtureRoot, "apps/desktop/engines/recodergit"), { recursive: true });
        fs.mkdirSync(path.join(fixtureRoot, "apps/desktop/server/engines/multica"), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    });

    it("accepts precise permissive inputs and the MIT Recoder replacement package", () => {
        const config = {
            files: [{ from: "dist", to: "dist" }],
            extraResources: [{ from: "../engines/dmux", to: "backend/engines/dmux" }],
        };
        expect(assertRestrictedEngineInputs(config, appRoot)).toMatchObject({ status: "pass", checkedInputs: 2 });

        const artifact = path.join(fixtureRoot, "artifact");
        const permissivePackage = path.join(artifact, "backend/node_modules/@recoder/recodergit");
        fs.mkdirSync(permissivePackage, { recursive: true });
        fs.writeFileSync(
            path.join(permissivePackage, "package.json"),
            JSON.stringify({ name: "@recoder/recodergit", license: "MIT" })
        );
        expect(assertRestrictedEnginesAbsentFromArtifact(artifact)).toMatchObject({
            status: "pass",
            scannedFiles: 1,
        });
    });

    it("rejects a direct restricted source and a broad source that would contain one", () => {
        expect(() =>
            assertRestrictedEngineInputs(
                { extraResources: [{ from: "../engines/recodergit", to: "backend/engines/recodergit" }] },
                appRoot
            )
        ).toThrowError(/recodergit-polyform/);
        expect(() =>
            assertRestrictedEngineInputs({ extraResources: [{ from: "..", to: "backend" }] }, appRoot)
        ).toThrowError(/multica-restricted-apache/);
    });

    it("rejects restricted package metadata, paths, licenses, and Go module linkage", () => {
        const cases: Array<[string, string, string]> = [
            ["package metadata", "node_modules/vendor/package.json", '{"name":"@recoder/recodergit-engine"}'],
            ["recodergit path", "backend/engines/recodergit/index.js", "clean"],
            ["recodergit license", "licenses/RECODERGIT", "PolyForm Noncommercial License 1.0.0"],
            ["multica path", "backend/server/engines/multica/server", "clean"],
            ["multica linkage", "bin/recoder-server.arm64", "github.com/multica-ai/multica/server/internal/service"],
        ];

        for (const [label, relative, contents] of cases) {
            const artifact = path.join(fixtureRoot, label.replaceAll(" ", "-"));
            const target = path.join(artifact, relative);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, contents);
            expect(() => assertRestrictedEnginesAbsentFromArtifact(artifact), label).toThrowError(
                /restricted engine (material|path)|recodergit-package|multica-go-module/
            );
        }
    });

    it("detects a marker split across scan chunks", () => {
        const file = path.join(fixtureRoot, "split.bin");
        const marker = "github.com/multica-ai/multica/server";
        fs.writeFileSync(file, Buffer.concat([Buffer.alloc(1024 * 1024 - 5, 0x61), Buffer.from(marker)]));
        expect(scanFileForMarkers(file)).toBe("multica-go-module");
    });

    it("records hashes for packaged Recoder server binaries and writes auditable evidence", () => {
        const artifact = path.join(fixtureRoot, "clean-artifact");
        const server = path.join(artifact, "dist/bin/recoder-server.arm64");
        fs.mkdirSync(path.dirname(server), { recursive: true });
        fs.writeFileSync(server, "permissive-wave-server");

        const report = assertRestrictedEnginesAbsentFromArtifact(artifact);
        expect(report.nativeEvidence).toHaveLength(1);
        expect(report.nativeEvidence[0]).toMatchObject({
            path: "dist/bin/recoder-server.arm64",
            forbiddenGoModuleMarker: false,
        });
        expect(report.nativeEvidence[0].sha256).toMatch(/^[a-f0-9]{64}$/);

        const evidence = path.join(fixtureRoot, "evidence/license-boundary.json");
        writeLicenseBoundaryEvidence(report, evidence);
        expect(JSON.parse(fs.readFileSync(evidence, "utf8"))).toMatchObject({ status: "pass", schemaVersion: 1 });
    });
});
