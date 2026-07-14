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
