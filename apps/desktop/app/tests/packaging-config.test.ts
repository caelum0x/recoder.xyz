// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const AppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Re-require the electron-builder config under a chosen RECODER_BUILD_TARGETS
// value (undefined = unset), busting the require cache each time so the env-gated
// win/linux blocks re-evaluate. Restores the prior env afterward so tests stay
// order-independent.
function loadConfig(targets: string | undefined): any {
    const configPath = path.join(AppRoot, "electron-builder.config.cjs");
    const prev = process.env.RECODER_BUILD_TARGETS;
    if (targets == null) {
        delete process.env.RECODER_BUILD_TARGETS;
    } else {
        process.env.RECODER_BUILD_TARGETS = targets;
    }
    delete require.cache[require.resolve(configPath)];
    try {
        return require(configPath);
    } finally {
        if (prev == null) {
            delete process.env.RECODER_BUILD_TARGETS;
        } else {
            process.env.RECODER_BUILD_TARGETS = prev;
        }
        delete require.cache[require.resolve(configPath)];
    }
}

const LogoSourceFiles = [
    "emain/emain-window.ts",
    "emain/emain-builder.ts",
    "frontend/app/onboarding/onboarding-command.tsx",
];

describe("packaging config", () => {
    const config = require(path.join(AppRoot, "electron-builder.config.cjs"));

    it("mac entitlements, entitlementsInherit, and icon paths exist", () => {
        const macPaths = [config.mac.entitlements, config.mac.entitlementsInherit, config.mac.icon];
        for (const p of macPaths) {
            expect(p, "mac packaging path must be set").toBeTruthy();
            expect(fs.existsSync(path.resolve(AppRoot, p)), `missing packaging asset: ${p}`).toBe(true);
        }
    });

    it("extendInfo permission strings carry no Wave branding", () => {
        const serialized = JSON.stringify(config.mac.extendInfo);
        expect(serialized).not.toMatch(/\bWave\b/);
    });

    it("bundles the embedded backend + tmux + native addons as extraResources", () => {
        const entries: Array<{ from: string; to: string }> = config.extraResources;
        const byTo = new Map(entries.map((e) => [e.to, e.from]));
        const expected: Array<[string, string]> = [
            ["backend/dist", "../../../backend/dist"],
            ["backend/node_modules", "../../../backend/node_modules"],
            ["backend/package.json", "../../../backend/package.json"],
            ["backend/data-template", "../../../backend/data"],
            ["backend/engines/tmux/tmux", "../engines/tmux/tmux"],
            ["backend/engines/herdr/herdr", "../engines/herdr/target/release/herdr"],
            [
                "native/recoder-governance-napi.node",
                "../../../backend/engines/rust/recoder-governance/target/release/recoder-governance-napi.node",
            ],
            [
                "native/lance_npm_bindings.node",
                "../../../crates/lance/npm-bindings/target/release/lance_npm_bindings.node",
            ],
            ["native/openfang_napi.node", "../../../backend/engines/rust/openfang/target/release/openfang_napi.node"],
            [
                "native/tensorzero_gateway_napi.node",
                "../../../backend/engines/rust/tensorzero/crates/target/release/tensorzero_gateway_napi.node",
            ],
        ];
        for (const [to, from] of expected) {
            expect(byTo.get(to), `extraResources entry missing for ${to}`).toBe(from);
        }
    });

    it("bundles the dmux engine dist and excludes the noncommercially-licensed recodergit", () => {
        const entries: Array<{ from: string; to: string }> = config.extraResources;
        const byTo = new Map(entries.map((e) => [e.to, e.from]));
        // dmux-adapter.ts walks ancestors for apps/desktop/engines/dmux and
        // lands on <resources>/backend/apps/desktop/engines/... when packaged.
        const expected: Array<[string, string]> = [
            ["backend/apps/desktop/engines/dmux/dist", "../engines/dmux/dist"],
            ["backend/apps/desktop/engines/dmux/dmux", "../engines/dmux/dmux"],
            ["backend/apps/desktop/engines/dmux/package.json", "../engines/dmux/package.json"],
        ];
        for (const [to, from] of expected) {
            expect(byTo.get(to), `extraResources entry missing for ${to}`).toBe(from);
            expect(fs.existsSync(path.resolve(AppRoot, byTo.get(to)!)), `missing engine dist source: ${from}`).toBe(
                true
            );
        }
        // recodergit is PolyForm Noncommercial (bd recoder-rxn0) — it must NOT
        // ship in the commercial DMG; recodergit-service degrades truthfully
        // when the dist is absent.
        for (const entry of entries) {
            expect(entry.from, "recodergit must not be bundled (license)").not.toContain("recodergit");
        }
        // The dmux launcher is a node-shebang script; it must stay executable in
        // the checkout so the copied resource keeps its exec bit.
        const dmuxLauncher = path.resolve(AppRoot, "../engines/dmux/dmux");
        expect(fs.statSync(dmuxLauncher).mode & 0o111, "dmux launcher must be executable").toBeTruthy();
    });

    it("checked-in extraResources sources exist (build artifacts excluded)", () => {
        // Only assert paths that live in the repo checkout; dist/node_modules
        // and the rust .node addons are build outputs verified at package time.
        const checkedIn = ["../../../backend/package.json", "../../../backend/data", "../engines/tmux"];
        for (const rel of checkedIn) {
            expect(fs.existsSync(path.resolve(AppRoot, rel)), `missing extraResources source: ${rel}`).toBe(true);
        }
    });

    it("emits no win/linux target blocks when RECODER_BUILD_TARGETS is unset (mac build unaffected)", () => {
        const fresh = loadConfig(undefined);
        expect(fresh.win, "win block must be absent by default").toBeUndefined();
        expect(fresh.linux, "linux block must be absent by default").toBeUndefined();
        expect(fresh.nsis, "nsis block must be absent by default").toBeUndefined();
    });

    it("staged win/linux blocks are inert: mac config is byte-identical whether or not they are requested", () => {
        const baseline = loadConfig(undefined);
        const withTargets = loadConfig("win,linux");
        expect(withTargets.mac, "mac block must not change when win/linux are staged").toEqual(baseline.mac);
        expect(withTargets.extraResources, "extraResources must not change").toEqual(baseline.extraResources);
        expect(withTargets.publish, "publish must not change").toEqual(baseline.publish);
        expect(withTargets.asarUnpack, "asarUnpack must not change").toEqual(baseline.asarUnpack);
    });

    it("RECODER_BUILD_TARGETS=win stages nsis+portable x64 with a windows icon, no linux block", () => {
        const winConfig = loadConfig("win");
        expect(winConfig.linux, "linux block must stay absent for win-only").toBeUndefined();
        const targets = winConfig.win.target.map((t: { target: string; arch: string[] }) => t.target);
        expect(targets).toContain("nsis");
        expect(targets).toContain("portable");
        for (const t of winConfig.win.target as Array<{ arch: string[] }>) {
            expect(t.arch, "staged windows targets are x64-only (no arm64 native artifacts yet)").toEqual(["x64"]);
        }
        expect(winConfig.win.icon).toBe("build/icon.ico");
        expect(fs.existsSync(path.resolve(AppRoot, winConfig.win.icon)), "windows icon asset must exist").toBe(true);
        expect(winConfig.nsis.oneClick).toBe(false);
    });

    it("RECODER_BUILD_TARGETS=linux stages AppImage+deb x64 with a png icon, no win block", () => {
        const linuxConfig = loadConfig("linux");
        expect(linuxConfig.win, "win block must stay absent for linux-only").toBeUndefined();
        const targets = linuxConfig.linux.target.map((t: { target: string; arch: string[] }) => t.target);
        expect(targets).toContain("AppImage");
        expect(targets).toContain("deb");
        for (const t of linuxConfig.linux.target as Array<{ arch: string[] }>) {
            expect(t.arch, "staged linux targets are x64-only (no arm64 native artifacts yet)").toEqual(["x64"]);
        }
        expect(linuxConfig.linux.icon).toBe("build/icon.png");
        expect(fs.existsSync(path.resolve(AppRoot, linuxConfig.linux.icon)), "linux icon asset must exist").toBe(true);
    });

    it("beforePack skips the Mach-O CPU-arch gate off darwin but keeps the existence gate", async () => {
        // A win/linux target on a mac host must not be arch-rejected by the mac
        // Mach-O header check (arm64 .node files would falsely mismatch x64); the
        // existence gate still runs. We assert the gate does NOT throw an
        // arch-mismatch for a linux x64 context given the present arm64 artifacts.
        const cfg = loadConfig("linux");
        await expect(
            cfg.beforePack({ electronPlatformName: "linux", arch: 1 })
        ).resolves.not.toThrow();
    });

    it("every logo referenced by emain and onboarding exists under public/logos", () => {
        const logoRefs = new Set<string>();
        for (const rel of LogoSourceFiles) {
            const source = fs.readFileSync(path.join(AppRoot, rel), "utf8");
            for (const match of source.matchAll(/(?:public)?\/logos\/([\w.-]+\.png)/g)) {
                logoRefs.add(match[1]);
            }
        }
        expect(logoRefs.size).toBeGreaterThan(0);
        for (const name of logoRefs) {
            const logoPath = path.join(AppRoot, "public/logos", name);
            expect(fs.existsSync(logoPath), `missing logo asset: public/logos/${name}`).toBe(true);
        }
    });
});
