// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const AppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

    it("bundles the recodergit + dmux engine dists where the backend resolvers expect them", () => {
        const entries: Array<{ from: string; to: string }> = config.extraResources;
        const byTo = new Map(entries.map((e) => [e.to, e.from]));
        // recodergit-service.ts resolves __dirname(backend/dist/domains/engines)
        // + '../../../apps/desktop/engines/recodergit/recodergit/dist/...', and
        // dmux-adapter.ts walks ancestors for apps/desktop/engines/dmux — both
        // land on <resources>/backend/apps/desktop/engines/... when packaged.
        const expected: Array<[string, string]> = [
            ["backend/apps/desktop/engines/recodergit/recodergit/dist", "../engines/recodergit/recodergit/dist"],
            [
                "backend/apps/desktop/engines/recodergit/recodergit/package.json",
                "../engines/recodergit/recodergit/package.json",
            ],
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
