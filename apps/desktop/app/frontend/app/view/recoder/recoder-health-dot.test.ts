// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The single quiet health dot's tone → className mapping (DESIGN-REFERENCE §3C):
// ONE quiet color. Graphite neutral by default (up), the SAME neutral merely
// emphasized for degraded, and one muted crimson reserved for a real down. This
// guards the truthful-tone contract: a health signal must NEVER read as a green
// "go" it hasn't earned, and degraded must not borrow a second (amber) warning hue.

import { describe, expect, it } from "vitest";
import { HealthDotTone, healthDotToneClass } from "./recoder";

const FORBIDDEN_HUES = ["emerald", "green", "amber", "lime", "teal", "blue", "yellow"];

describe("healthDotToneClass — one quiet dot, never a stoplight", () => {
    it("maps up to a dim, neutral graphite dot (never green)", () => {
        const cls = healthDotToneClass("up");
        expect(cls).toBe(HealthDotTone.up);
        expect(cls).toContain("white");
        for (const hue of FORBIDDEN_HUES) {
            expect(cls).not.toContain(hue);
        }
    });

    it("maps degraded to the SAME neutral, only emphasized — not a second (amber) color", () => {
        const cls = healthDotToneClass("degraded");
        expect(cls).toBe(HealthDotTone.degraded);
        expect(cls).toContain("white");
        for (const hue of FORBIDDEN_HUES) {
            expect(cls).not.toContain(hue);
        }
        // Degraded is a de-emphasis step of the neutral, so it must differ from up
        // (heavier) yet stay the same neutral family (not a distinct warning hue).
        expect(cls).not.toBe(healthDotToneClass("up"));
    });

    it("maps down to the one muted crimson, never green", () => {
        const cls = healthDotToneClass("down");
        expect(cls).toBe(HealthDotTone.down);
        expect(cls).toContain("error");
        for (const hue of FORBIDDEN_HUES) {
            expect(cls).not.toContain(hue);
        }
    });

    it("keeps up, degraded, and down visually distinct", () => {
        const up = healthDotToneClass("up");
        const degraded = healthDotToneClass("degraded");
        const down = healthDotToneClass("down");
        expect(new Set([up, degraded, down]).size).toBe(3);
    });

    it("never emits a forbidden hue for any tone", () => {
        for (const cls of Object.values(HealthDotTone)) {
            for (const hue of FORBIDDEN_HUES) {
                expect(cls).not.toContain(hue);
            }
        }
    });

    it("crimson (down) is the ONLY tone that uses the error accent", () => {
        const errorTones = Object.entries(HealthDotTone).filter(([, cls]) => cls.includes("error"));
        expect(errorTones.map(([tone]) => tone)).toEqual(["down"]);
    });
});
