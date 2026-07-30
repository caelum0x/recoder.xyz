// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { identityInitials } from "./recoder-identity-avatar";

describe("identityInitials", () => {
    it("uses first + last word initials for a multi-word name", () => {
        expect(identityInitials("Ada Lovelace")).toBe("AL");
        expect(identityInitials("  jean  luc  picard ")).toBe("JP");
    });

    it("uses the first two letters for a single-word name", () => {
        expect(identityInitials("madonna")).toBe("MA");
        expect(identityInitials("x")).toBe("X");
    });

    it("falls back to the email local-part's first letter when no name", () => {
        expect(identityInitials("", "grace@recoder.xyz")).toBe("G");
        expect(identityInitials(undefined, "  dev@x.io ")).toBe("D");
    });

    it("returns '?' when neither name nor email is usable (never empty, never throws)", () => {
        expect(identityInitials()).toBe("?");
        expect(identityInitials("   ", "   ")).toBe("?");
        expect(identityInitials("", "@nolocalpart")).toBe("?");
    });
});
