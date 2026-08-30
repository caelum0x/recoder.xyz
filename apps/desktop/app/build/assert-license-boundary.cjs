// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RestrictedEngines = Object.freeze([
    {
        id: "recodergit-polyform",
        source: "../engines/recodergit",
        packageName: "@recoder/recodergit-engine",
        license: "PolyForm-Noncommercial-1.0.0",
    },
    {
        id: "multica-restricted-apache",
        source: "../server/engines/multica",
        moduleName: "github.com/multica-ai/multica/server",
        license: "modified Apache-2.0",
    },
]);

const ForbiddenPathPatterns = Object.freeze([
    /(^|\/)apps\/desktop\/engines\/recodergit(\/|$)/i,
    /(^|\/)engines\/recodergit(\/|$)/i,
    /(^|\/)apps\/desktop\/server\/engines\/multica(\/|$)/i,
    /(^|\/)server\/engines\/multica(\/|$)/i,
    /(^|\/)node_modules\/@recoder\/recodergit-engine(\/|$)/i,
]);

const ForbiddenContentMarkers = Object.freeze([
    { id: "recodergit-license", value: "PolyForm Noncommercial License 1.0.0" },
    { id: "recodergit-required-notice", value: "Required Notice: Copyright Abhigyan Patwari" },
    { id: "multica-go-module", value: "github.com/multica-ai/multica/server" },
    {
        id: "multica-license",
        value: "Multica is licensed under a modified version of the Apache License 2.0",
    },
]);

function isSameOrAncestor(candidate, target) {
    const relative = path.relative(candidate, target);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function resolveRealPathWhenPresent(file) {
    return fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file);
}

function collectPackagingSources(config) {
    const sources = [];
    for (const [section, entries] of [
        ["files", config?.files],
        ["extraResources", config?.extraResources],
    ]) {
        if (!Array.isArray(entries)) {
            continue;
        }
        for (const entry of entries) {
            if (entry && typeof entry === "object" && typeof entry.from === "string") {
                sources.push({ section, from: entry.from });
            }
        }
    }
    return sources;
}

function assertRestrictedEngineInputs(config, appRoot, engines = RestrictedEngines) {
    const restricted = engines.map((engine) => ({
        ...engine,
        resolved: resolveRealPathWhenPresent(path.resolve(appRoot, engine.source)),
    }));
    const checked = [];
    const violations = [];

    for (const input of collectPackagingSources(config)) {
        const resolved = resolveRealPathWhenPresent(path.resolve(appRoot, input.from));
        checked.push({ ...input, resolved });
        for (const engine of restricted) {
            if (isSameOrAncestor(resolved, engine.resolved) || isSameOrAncestor(engine.resolved, resolved)) {
                violations.push(`${input.section}:${input.from} crosses ${engine.id} (${engine.source})`);
            }
        }
    }

    if (violations.length > 0) {
        throw new Error(
            "desktop license boundary: restricted engine source included by packaging:\n" +
                violations.map((violation) => `  - ${violation}`).join("\n")
        );
    }

    return {
        status: "pass",
        checkedInputs: checked.length,
        restrictedEngines: restricted.map(({ id, source, license }) => ({ id, source, license })),
    };
}

function scanFileForMarkers(file, markers = ForbiddenContentMarkers) {
    const encoded = markers.map((marker) => ({ ...marker, needle: Buffer.from(marker.value) }));
    const overlapSize = Math.max(0, ...encoded.map((marker) => marker.needle.length - 1));
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    let carry = Buffer.alloc(0);
    let fd;

    try {
        fd = fs.openSync(file, "r");
        while (true) {
            const bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null);
            if (bytesRead === 0) {
                return null;
            }
            const haystack =
                carry.length > 0 ? Buffer.concat([carry, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead);
            for (const marker of encoded) {
                if (haystack.indexOf(marker.needle) !== -1) {
                    return marker.id;
                }
            }
            carry =
                overlapSize > 0
                    ? Buffer.from(haystack.subarray(Math.max(0, haystack.length - overlapSize)))
                    : Buffer.alloc(0);
        }
    } finally {
        if (fd != null) {
            fs.closeSync(fd);
        }
    }
}

function packageManifestViolation(file) {
    if (path.basename(file) !== "package.json") {
        return null;
    }
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
    if (manifest?.name === "@recoder/recodergit-engine") {
        return "recodergit-package";
    }
    if (manifest?.license === "PolyForm-Noncommercial-1.0.0") {
        return "recodergit-package-license";
    }
    return null;
}

function assertRestrictedEnginesAbsentFromArtifact(artifactRoot, markers = ForbiddenContentMarkers) {
    const root = path.resolve(artifactRoot);
    if (!fs.statSync(root).isDirectory()) {
        throw new Error(`desktop license boundary: artifact root is not a directory: ${root}`);
    }

    const pending = [root];
    const violations = [];
    const nativeEvidence = [];
    let scannedFiles = 0;
    let scannedBytes = 0;

    while (pending.length > 0) {
        const current = pending.pop();
        const stat = fs.lstatSync(current);
        const relative = path.relative(root, current).split(path.sep).join("/");

        if (relative && ForbiddenPathPatterns.some((pattern) => pattern.test(relative))) {
            violations.push(`${relative}: restricted engine path`);
        }

        if (stat.isSymbolicLink()) {
            const target = fs.readlinkSync(current).split(path.sep).join("/");
            if (ForbiddenPathPatterns.some((pattern) => pattern.test(target))) {
                violations.push(`${relative}: symlink targets restricted engine path ${target}`);
            }
            continue;
        }
        if (stat.isDirectory()) {
            const children = fs.readdirSync(current).sort().reverse();
            for (const child of children) {
                pending.push(path.join(current, child));
            }
            continue;
        }
        if (!stat.isFile()) {
            continue;
        }

        scannedFiles += 1;
        scannedBytes += stat.size;
        const manifestMarker = packageManifestViolation(current);
        const contentMarker = scanFileForMarkers(current, markers);
        if (manifestMarker) {
            violations.push(`${relative}: ${manifestMarker}`);
        }
        if (contentMarker) {
            violations.push(`${relative}: ${contentMarker}`);
        }

        if (/recoder-server(?:\.|$)/.test(path.basename(current))) {
            nativeEvidence.push({
                path: relative,
                bytes: stat.size,
                sha256: crypto.createHash("sha256").update(fs.readFileSync(current)).digest("hex"),
                forbiddenGoModuleMarker: false,
            });
        }
    }

    if (violations.length > 0) {
        throw new Error(
            "desktop license boundary: restricted engine material found in packaged artifact:\n" +
                violations.map((violation) => `  - ${violation}`).join("\n")
        );
    }

    return {
        schemaVersion: 1,
        status: "pass",
        artifactRoot: root,
        scannedFiles,
        scannedBytes,
        restrictedEngines: RestrictedEngines.map(({ id, source, license, packageName, moduleName }) => ({
            id,
            source,
            license,
            packageName,
            moduleName,
        })),
        nativeEvidence,
    };
}

function writeLicenseBoundaryEvidence(report, outputFile) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
}

module.exports = {
    ForbiddenContentMarkers,
    RestrictedEngines,
    assertRestrictedEngineInputs,
    assertRestrictedEnginesAbsentFromArtifact,
    scanFileForMarkers,
    writeLicenseBoundaryEvidence,
};
