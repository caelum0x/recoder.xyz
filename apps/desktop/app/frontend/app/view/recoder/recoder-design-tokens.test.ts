// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-scan guard for DESIGN-REFERENCE conformance on the Terminal/Diff
// surfaces: calm weights (400-500, never font-semibold/bold), no emoji status
// glyphs, no novelty FA variants. These are render-only rules that can't be
// asserted through the model layer, so we scan the source directly. See
// docs/PRODUCT-GAPS.md PW2-7.
const HERE = new URL(".", import.meta.url).pathname;
const FILES: Record<string, string> = {
    terminal: join(HERE, "recoder-terminal.tsx"),
    diff: join(HERE, "..", "recoder-diff", "recoder-diff.tsx"),
};

describe("recoder terminal/diff design tokens (PW2-7)", () => {
    it("uses no heavier-than-medium font weight", () => {
        for (const [name, path] of Object.entries(FILES)) {
            const src = readFileSync(path, "utf8");
            expect(src, `${name} must not use font-semibold/bold`).not.toMatch(/font-(semibold|bold)/);
        }
    });

    it("embeds no emoji status glyphs (use FA icons or words)", () => {
        for (const [name, path] of Object.entries(FILES)) {
            const src = readFileSync(path, "utf8");
            expect(src, `${name} must not embed ✓/✕/★ status glyphs`).not.toMatch(/[✓✔✕✖★]/);
        }
    });

    it("uses no novelty/colored FA glyph variants", () => {
        const src = readFileSync(FILES.diff, "utf8");
        expect(src).not.toContain("fa-comment-medical");
    });
});
