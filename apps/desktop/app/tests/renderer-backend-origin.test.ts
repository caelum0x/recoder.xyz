// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RendererRoot = path.resolve(import.meta.dirname, "../frontend");
const EndpointFile = path.join(RendererRoot, "app/view/recoder/recoder-endpoints.ts");
const SourceExtensions = new Set([".ts", ".tsx"]);

function rendererSources(dir: string): string[] {
    const sources: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            sources.push(...rendererSources(target));
        } else if (SourceExtensions.has(path.extname(entry.name)) && !entry.name.includes(".test.")) {
            sources.push(target);
        }
    }
    return sources;
}

describe("renderer backend-origin boundary", () => {
    it("keeps the loopback fallback in the endpoint resolver only", () => {
        const offenders = rendererSources(RendererRoot)
            .filter((file) => file !== EndpointFile)
            .filter((file) => /(?:127\.0\.0\.1|localhost):3100/.test(fs.readFileSync(file, "utf8")))
            .map((file) => path.relative(RendererRoot, file));
        expect(offenders).toEqual([]);
    });

    it("does not create HTTP or WebSocket clients from literal origins", () => {
        const literalClient = /(?:fetch|new\s+WebSocket)\s*\(\s*[`'"](?:https?|wss?):\/\//;
        const offenders = rendererSources(RendererRoot)
            .filter((file) => literalClient.test(fs.readFileSync(file, "utf8")))
            .map((file) => path.relative(RendererRoot, file));
        expect(offenders).toEqual([]);
    });
});
