// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import gate from "./assert-extra-resources.cjs";

const { assertExtraResourcesExist, readBinaryArch } = gate;

const APP_ROOT = "/repo/apps/desktop/app";
const LANCE = "../../../crates/lance/npm-bindings/target/release/lance_npm_bindings.node";
const OPENFANG = "../../../backend/engines/rust/openfang/target/release/openfang_napi.node";
const BD = "../server/engines/beads/bin/bd";

function machoBuffer(cputype) {
    const buf = Buffer.alloc(20);
    buf.writeUInt32BE(0xfeedfacf, 0);
    buf.writeUInt32LE(cputype, 4);
    return buf;
}

function writeTemp(buf) {
    const file = path.join(
        os.tmpdir(),
        `assert-extra-resources-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
    );
    fs.writeFileSync(file, buf);
    return file;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("assertExtraResourcesExist", () => {
    it("keeps the 2-arg signature back-compatible: a missing source throws and is listed", () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(false);
        expect(() => assertExtraResourcesExist([{ from: LANCE }], APP_ROOT)).toThrow(LANCE);
        expect(() => assertExtraResourcesExist([{ from: LANCE }], APP_ROOT)).toThrow(
            /REQUIRED source\(s\) missing/
        );
    });

    it("treats a missing OPTIONAL source as a loud degrade, not a fatal throw", () => {
        vi.spyOn(fs, "existsSync").mockImplementation((p) => String(p).includes("openfang"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const verified = assertExtraResourcesExist([{ from: LANCE }, { from: OPENFANG }], APP_ROOT, {
            optional: new Set([LANCE]),
        });
        expect(verified).toHaveLength(1);
        const printed = warn.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(printed).toContain("SHIPPING DEGRADED");
        expect(printed).toContain(LANCE);
    });

    it("still throws for a REQUIRED missing source even when opts declare an optional set", () => {
        vi.spyOn(fs, "existsSync").mockImplementation((p) => !String(p).includes("does-not-exist"));
        vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(() =>
            assertExtraResourcesExist([{ from: LANCE }, { from: "../does-not-exist.node" }], APP_ROOT, {
                optional: new Set([LANCE]),
            })
        ).toThrow("does-not-exist.node");
    });

    it("returns the verified list when everything is present and no targetArch is given", () => {
        vi.spyOn(fs, "existsSync").mockReturnValue(true);
        const verified = assertExtraResourcesExist([{ from: OPENFANG }, { from: BD }], APP_ROOT);
        expect(verified).toHaveLength(2);
    });

    it("throws an arch mismatch when an arch-sensitive arm64 binary targets x64", () => {
        const file = writeTemp(machoBuffer(0x0100000c));
        const rel = path.relative(APP_ROOT, file);
        try {
            expect(() =>
                assertExtraResourcesExist([{ from: rel }], APP_ROOT, {
                    targetArch: "x64",
                    archSensitive: new Set([rel]),
                })
            ).toThrow("is arm64, need x64");
        } finally {
            fs.unlinkSync(file);
        }
    });

    it("does not throw an arch check when target arch matches", () => {
        const file = writeTemp(machoBuffer(0x0100000c));
        const rel = path.relative(APP_ROOT, file);
        try {
            const verified = assertExtraResourcesExist([{ from: rel }], APP_ROOT, {
                targetArch: "arm64",
                archSensitive: new Set([rel]),
            });
            expect(verified).toHaveLength(1);
        } finally {
            fs.unlinkSync(file);
        }
    });

    it("fails open on an unparseable header (present file, unknown arch, no throw)", () => {
        const file = writeTemp(Buffer.from("not a native binary at all"));
        const rel = path.relative(APP_ROOT, file);
        try {
            const verified = assertExtraResourcesExist([{ from: rel }], APP_ROOT, {
                targetArch: "x64",
                archSensitive: new Set([rel]),
            });
            expect(verified).toHaveLength(1);
        } finally {
            fs.unlinkSync(file);
        }
    });

    it("throws for an entry with no 'from'", () => {
        expect(() => assertExtraResourcesExist([{ to: "somewhere" }], APP_ROOT)).toThrow();
    });

    it("throws when extraResources is not an array", () => {
        expect(() => assertExtraResourcesExist(null, APP_ROOT)).toThrow("expected an array");
    });
});

describe("readBinaryArch", () => {
    it("reads arm64 from a Mach-O 64 header", () => {
        const file = writeTemp(machoBuffer(0x0100000c));
        try {
            expect(readBinaryArch(file)).toBe("arm64");
        } finally {
            fs.unlinkSync(file);
        }
    });

    it("reads x64 from a Mach-O 64 header", () => {
        const file = writeTemp(machoBuffer(0x01000007));
        try {
            expect(readBinaryArch(file)).toBe("x64");
        } finally {
            fs.unlinkSync(file);
        }
    });

    it("returns null for a non-binary file", () => {
        const file = writeTemp(Buffer.from("plain text"));
        try {
            expect(readBinaryArch(file)).toBeNull();
        } finally {
            fs.unlinkSync(file);
        }
    });

    it("returns null for a missing file rather than throwing", () => {
        expect(readBinaryArch(path.join(os.tmpdir(), "definitely-not-here.node"))).toBeNull();
    });
});
