// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const fs = require("fs");
const path = require("path");

/**
 * Fail-loud packaging gate: every extraResources `from` source must exist on
 * disk before electron-builder packs, or packaging aborts with the full list
 * of missing artifacts. Without this, electron-builder silently skips missing
 * sources and the packaged desktop ships without its native engines (e.g. the
 * embedded tensorzero gateway .node) — dead inference with no build error.
 *
 * @param {Array<string | { from?: string; to?: string }>} extraResources
 * @param {string} appRoot absolute dir `from` paths are resolved against
 * @returns {string[]} the resolved source paths that were verified
 */
function assertExtraResourcesExist(extraResources, appRoot) {
    if (!Array.isArray(extraResources)) {
        throw new Error("extraResources gate: expected an array of extraResources entries");
    }
    const missing = [];
    const verified = [];
    for (const entry of extraResources) {
        const from = typeof entry === "string" ? entry : entry?.from;
        if (!from) {
            missing.push(`(entry with no 'from': ${JSON.stringify(entry)})`);
            continue;
        }
        const resolved = path.resolve(appRoot, from);
        if (fs.existsSync(resolved)) {
            verified.push(resolved);
        } else {
            missing.push(from);
        }
    }
    if (missing.length > 0) {
        throw new Error(
            `electron-builder extraResources gate: ${missing.length} missing source path(s):\n` +
                missing.map((m) => `  - ${m}`).join("\n") +
                "\nBuild the missing artifacts first — native .node addons come from " +
                "scripts/build-native-addons.sh (release builds only; there is no debug fallback), " +
                "backend/dist from the backend build, cockpit/dist from the cockpit build, " +
                "the beads bd binary (never committed — >100MB, stripped from git history) from " +
                "`cd apps/desktop/server/engines/beads && go build -o bin/bd ./cmd/bd`. " +
                "Refusing to package a desktop app with silently-missing engine artifacts."
        );
    }
    return verified;
}

module.exports = { assertExtraResourcesExist };
