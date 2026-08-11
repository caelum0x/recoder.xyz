// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Invisible-engines contract (PRODUCT-GAPS PW2-6): the desktop never names its
// backend engines to a user. The board's `bd` issue graph and the settings
// "engine blocks" are implementation detail — legit to reference in COMMENTS and
// model code, but never in rendered copy. We strip comments, then scan the two
// user-facing view files for the concrete leak phrases so they can't regress.
const HERE = new URL(".", import.meta.url).pathname;
const VIEW_FILES: Record<string, string> = {
    board: join(HERE, "recoder-board.tsx"),
    settings: join(HERE, "..", "recoder-settings", "recoder-settings.tsx"),
};

// Drop block comments and line comments (leaving `://` in URLs intact) so a
// legitimate `// bd reachable` doc line never trips the guard.
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .split("\n")
        .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/([^:])\/\/.*$/, "$1"))
        .join("\n");
}

const BANNED_COPY: readonly RegExp[] = [/beads/i, /engine[ -]blocks?/i, /\bbd (cli|command|issue|ready|graph)\b/i];

describe("invisible-engines: no engine leaks in user-facing copy (PW2-6)", () => {
    for (const [name, path] of Object.entries(VIEW_FILES)) {
        it(`${name} view names no backend engine to the user`, () => {
            const code = stripComments(readFileSync(path, "utf8"));
            for (const pattern of BANNED_COPY) {
                expect(code, `${name} leaks ${pattern} into rendered copy`).not.toMatch(pattern);
            }
        });
    }
});
