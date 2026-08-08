// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * recoder-f8pn: `open-native-path` expanded `~` with an unanchored
 * `String.replace("~", home)`, which rewrites the FIRST `~` anywhere in the
 * path — so `/data/file~backup` became `/data/file<HOME>backup`, opening the
 * wrong (or a non-existent) path. Expansion must only apply to a LEADING `~`
 * that stands for the home directory (`~` alone or `~/...`), and must leave a
 * `~` that appears mid-path untouched.
 */
import { describe, expect, it } from "vitest";
import { expandLeadingTilde } from "./emain-path-util";

const HOME = "/Users/alice";

describe("expandLeadingTilde (recoder-f8pn)", () => {
    it("expands a bare ~ to the home directory", () => {
        expect(expandLeadingTilde("~", HOME)).toBe(HOME);
    });

    it("expands a leading ~/ prefix", () => {
        expect(expandLeadingTilde("~/Documents/x.txt", HOME)).toBe(`${HOME}/Documents/x.txt`);
    });

    it("does NOT touch a ~ that appears mid-path", () => {
        expect(expandLeadingTilde("/data/file~backup", HOME)).toBe("/data/file~backup");
    });

    it("only expands the leading ~ once, leaving later ~ intact", () => {
        expect(expandLeadingTilde("~/a~b/c", HOME)).toBe(`${HOME}/a~b/c`);
    });

    it("does NOT expand ~user (a different user's home is not this home)", () => {
        expect(expandLeadingTilde("~bob/notes", HOME)).toBe("~bob/notes");
    });

    it("leaves an absolute path unchanged", () => {
        expect(expandLeadingTilde("/usr/local/bin", HOME)).toBe("/usr/local/bin");
    });

    it("returns an empty string unchanged", () => {
        expect(expandLeadingTilde("", HOME)).toBe("");
    });
});
