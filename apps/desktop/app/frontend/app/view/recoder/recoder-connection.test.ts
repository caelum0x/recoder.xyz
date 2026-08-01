// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { deriveConnectionState } from "./recoder-connection";

const StaleAfterMs = 15000;

describe("deriveConnectionState", () => {
    it("reports offline when a poll has never succeeded", () => {
        expect(deriveConnectionState(null, 10_000, StaleAfterMs)).toBe("offline");
    });

    it("reports live for a fresh success within the stale window", () => {
        expect(deriveConnectionState(10_000, 10_000, StaleAfterMs)).toBe("live");
        expect(deriveConnectionState(10_000, 10_000 + StaleAfterMs, StaleAfterMs)).toBe("live");
    });

    it("reports stale once the last success ages past the threshold", () => {
        expect(deriveConnectionState(10_000, 10_000 + StaleAfterMs + 1, StaleAfterMs)).toBe("stale");
    });
});
