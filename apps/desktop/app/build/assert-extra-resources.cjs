// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const fs = require("fs");
const path = require("path");

const CPU_TYPE_ARM64 = 0x0100000c;
const CPU_TYPE_X64 = 0x01000007;
const MACHO_MAGIC_64 = 0xfeedfacf;
const ELF_MAGIC = 0x7f454c46;
const ELF_MACHINE_X64 = 0x3e;
const ELF_MACHINE_ARM64 = 0xb7;

/**
 * Build the platform-sensitive options for the fail-loud resource gate.
 * Existence is always enforced. CPU-header validation is macOS-only because
 * staged Windows/Linux packaging must use on-target artifacts rather than
 * interpreting a Darwin Mach-O header as its target architecture.
 */
function buildExtraResourcesGateOptions(platform, archName, optional, archSensitive) {
    const isDarwin = platform === "darwin";
    return {
        targetArch: isDarwin && archName !== "universal" ? archName : null,
        optional,
        archSensitive: isDarwin ? archSensitive : new Set(),
    };
}

/**
 * Read a native binary's CPU arch from its header, without a shell or any heavy
 * tooling — the first ~20 bytes are enough. Returns "arm64" | "x64" | null.
 * A null (unparseable / unknown format) is fail-open: the arch check never
 * BLOCKS on a header it could not read, it only blocks on a confirmed mismatch.
 *
 * @param {string} file absolute path to a native artifact
 * @returns {"arm64" | "x64" | null}
 */
function readBinaryArch(file) {
    let fd;
    try {
        fd = fs.openSync(file, "r");
    } catch {
        return null;
    }
    try {
        const buf = Buffer.alloc(20);
        const read = fs.readSync(fd, buf, 0, 20, 0);
        if (read < 8) {
            return null;
        }
        // Mach-O 64-bit (macOS): magic 0xFEEDFACF, cputype (little-endian) at offset 4.
        if (buf.readUInt32BE(0) === MACHO_MAGIC_64 || buf.readUInt32LE(0) === MACHO_MAGIC_64) {
            const cpu = buf.readUInt32LE(4);
            if (cpu === CPU_TYPE_ARM64) {
                return "arm64";
            }
            if (cpu === CPU_TYPE_X64) {
                return "x64";
            }
            return null;
        }
        // ELF (Linux): 0x7F 'E' 'L' 'F', e_machine (little-endian) at offset 18.
        if (read >= 20 && buf.readUInt32BE(0) === ELF_MAGIC) {
            const machine = buf.readUInt16LE(18);
            if (machine === ELF_MACHINE_ARM64) {
                return "arm64";
            }
            if (machine === ELF_MACHINE_X64) {
                return "x64";
            }
            return null;
        }
        // PE (Windows) and everything else: the desktop ships node-provided
        // runtimes there, so skip — unknown → fail-open.
        return null;
    } catch {
        return null;
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Fail-loud packaging gate: every extraResources `from` source must exist on
 * disk before electron-builder packs, or packaging aborts with the full list
 * of missing artifacts. Without this, electron-builder silently skips missing
 * sources and the packaged desktop ships without its native engines (e.g. the
 * embedded tensorzero gateway .node) — dead inference with no build error.
 *
 * Three outcomes per entry, resolved against `appRoot`:
 *   1. missing + REQUIRED  → collected + THROW (abort pack) with the exact list.
 *   2. missing + OPTIONAL   → collected + printed LOUDLY, non-fatal (deliberate
 *      degrade, e.g. an optional NAPI accelerator falling back to its owned
 *      subprocess/TypeScript adapter).
 *   3. present + ARCH-SENSITIVE → header read; if CPU arch ≠ targetArch → THROW
 *      (catches the arm64-in-x64-dmg hazard the plain existence check misses).
 *
 * The `opts` object is additive — the historical 2-arg signature stays
 * back-compatible (no opts ⇒ every entry is required, no arch check, no
 * degrade class), so existing callers keep the original behavior exactly.
 *
 * @param {Array<string | { from?: string; to?: string }>} extraResources
 * @param {string} appRoot absolute dir `from` paths are resolved against
 * @param {{ targetArch?: string | null, optional?: Set<string>, archSensitive?: Set<string> }} [opts]
 * @returns {string[]} the resolved source paths that were verified present
 */
function assertExtraResourcesExist(extraResources, appRoot, opts = {}) {
    if (!Array.isArray(extraResources)) {
        throw new Error("extraResources gate: expected an array of extraResources entries");
    }
    const { targetArch = null, optional = new Set(), archSensitive = new Set() } = opts;
    const missing = [];
    const degraded = [];
    const archMismatch = [];
    const verified = [];
    for (const entry of extraResources) {
        const from = typeof entry === "string" ? entry : entry?.from;
        if (!from) {
            missing.push(`(entry with no 'from': ${JSON.stringify(entry)})`);
            continue;
        }
        const resolved = path.resolve(appRoot, from);
        if (!fs.existsSync(resolved)) {
            (optional.has(from) ? degraded : missing).push(from);
            continue;
        }
        if (targetArch && archSensitive.has(from)) {
            const got = readBinaryArch(resolved);
            if (got && got !== targetArch) {
                archMismatch.push(`${from} (is ${got}, need ${targetArch})`);
            }
        }
        verified.push(resolved);
    }

    if (degraded.length > 0) {
        console.warn(
            `\n[packaging-truth] SHIPPING DEGRADED — ${degraded.length} optional engine artifact(s) absent:\n` +
                degraded.map((d) => `  - ${d}  → runtime degrades truthfully (see health roster)`).join("\n") +
                "\n"
        );
    }

    const fatal = [];
    if (missing.length > 0) {
        fatal.push(
            `${missing.length} REQUIRED source(s) missing:\n` + missing.map((m) => `  - ${m}`).join("\n")
        );
    }
    if (archMismatch.length > 0) {
        fatal.push(
            `${archMismatch.length} arch mismatch(es) for target ${targetArch}:\n` +
                archMismatch.map((m) => `  - ${m}`).join("\n")
        );
    }
    if (fatal.length > 0) {
        throw new Error(
            "electron-builder extraResources gate:\n" +
                fatal.join("\n") +
                "\nBuild the missing artifacts first — native .node addons come from " +
                "scripts/build-native-addons.sh (release builds only; there is no debug fallback), " +
                "backend/dist from the backend build, " +
                "the beads bd binary (never committed — >100MB, stripped from git history) from " +
                "`cd apps/desktop/server/engines/beads && go build -o bin/bd ./cmd/bd`. " +
                "Refusing to package a desktop app with silently-missing or wrong-arch engine artifacts."
        );
    }
    return verified;
}

module.exports = { assertExtraResourcesExist, buildExtraResourcesGateOptions, readBinaryArch };
