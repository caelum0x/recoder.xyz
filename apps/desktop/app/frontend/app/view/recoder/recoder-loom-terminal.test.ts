// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { loomReconnectDelayMs } from "./recoder-loom-terminal";

describe("Loom terminal recovery", () => {
    it("uses capped exponential reconnect delays", () => {
        expect([0, 1, 2, 3, 4, 5, 6].map(loomReconnectDelayMs)).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000]);
    });
});
