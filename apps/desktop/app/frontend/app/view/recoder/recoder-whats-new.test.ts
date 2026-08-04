// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    compareVersions,
    parseVersion,
    readSeenVersion,
    selectWhatsNew,
    WHATS_NEW_SEEN_KEY,
    writeSeenVersion,
    type SeenStore,
    type WhatsNewEntry,
} from "./recoder-whats-new";

function fakeStore(seed: Record<string, string> = {}): SeenStore & { data: Record<string, string> } {
    const data = { ...seed };
    return {
        data,
        getItem: (k: string) => (k in data ? data[k] : null),
        setItem: (k: string, v: string) => {
            data[k] = v;
        },
    };
}

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

describe("readSeenVersion / writeSeenVersion — dismissal persistence", () => {
    it("reads the acknowledged version back from the store", () => {
        const store = fakeStore({ [WHATS_NEW_SEEN_KEY]: "1.1.0" });
        expect(readSeenVersion(store)).toBe("1.1.0");
    });

    it("defaults to '' when nothing was ever acknowledged", () => {
        expect(readSeenVersion(fakeStore())).toBe("");
        expect(readSeenVersion(null)).toBe("");
    });

    it("dismiss persists the current version so the same release never nags twice", () => {
        // The user last acknowledged 1.0.0; upgrading to 1.2.0 shows the two newer entries…
        const store = fakeStore({ [WHATS_NEW_SEEN_KEY]: "1.0.0" });
        expect(selectWhatsNew(entries, readSeenVersion(store), "1.2.0").map((e) => e.version)).toEqual([
            "1.2.0",
            "1.1.0",
        ]);
        writeSeenVersion(store, "1.2.0");
        expect(store.data[WHATS_NEW_SEEN_KEY]).toBe("1.2.0");
        // …and after dismissal the same version selects nothing.
        expect(selectWhatsNew(entries, readSeenVersion(store), "1.2.0")).toEqual([]);
    });

    it("a throwing store degrades to '' on read and a no-op on write (never breaks the board)", () => {
        const hostile: SeenStore = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("blocked");
            },
        };
        expect(readSeenVersion(hostile)).toBe("");
        expect(() => writeSeenVersion(hostile, "1.2.0")).not.toThrow();
        expect(() => writeSeenVersion(null, "1.2.0")).not.toThrow();
    });
});
