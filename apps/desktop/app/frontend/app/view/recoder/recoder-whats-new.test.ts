// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion, selectWhatsNew, type WhatsNewEntry } from "./recoder-whats-new";

const entries: WhatsNewEntry[] = [
    { version: "1.0.0", title: "one", notes: [] },
    { version: "1.1.0", title: "two", notes: [] },
    { version: "1.2.0", title: "three", notes: [] },
];

describe("parseVersion / compareVersions", () => {
    it("parses semver, tolerating a v-prefix and pre-release/build suffixes", () => {
        expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
        expect(parseVersion("1.2.3-beta.1")).toEqual([1, 2, 3]);
        expect(parseVersion("nonsense")).toEqual([0, 0, 0]);
    });

    it("orders major → minor → patch", () => {
        expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
        expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
        expect(compareVersions("1.1.0", "1.1.0")).toBe(0);
    });
});

describe("selectWhatsNew", () => {
    it("shows nothing on a first run (no acknowledged version — never spam a fresh install)", () => {
        expect(selectWhatsNew(entries, "", "1.2.0")).toEqual([]);
    });

    it("shows entries newer than last-seen up to current, newest first", () => {
        const shown = selectWhatsNew(entries, "1.0.0", "1.2.0");
        expect(shown.map((e) => e.version)).toEqual(["1.2.0", "1.1.0"]);
    });

    it("excludes entries newer than the running version (no notes for what you're not on)", () => {
        expect(selectWhatsNew(entries, "1.0.0", "1.1.0").map((e) => e.version)).toEqual(["1.1.0"]);
    });

    it("shows nothing when already caught up (last-seen == current)", () => {
        expect(selectWhatsNew(entries, "1.2.0", "1.2.0")).toEqual([]);
    });
});
