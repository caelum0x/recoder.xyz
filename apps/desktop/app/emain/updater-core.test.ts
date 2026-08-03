// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { updateFeedEnabled } from "./updater-core";

describe("updateFeedEnabled", () => {
    it("is enabled by default when RECODER_UPDATE_FEED is unset", () => {
        expect(updateFeedEnabled({})).toBe(true);
    });

    it("is disabled when RECODER_UPDATE_FEED is 'off'", () => {
        expect(updateFeedEnabled({ RECODER_UPDATE_FEED: "off" })).toBe(false);
        expect(updateFeedEnabled({ RECODER_UPDATE_FEED: "OFF" })).toBe(false);
        expect(updateFeedEnabled({ RECODER_UPDATE_FEED: " off " })).toBe(false);
    });

    it("is disabled when RECODER_UPDATE_FEED is '0'", () => {
        expect(updateFeedEnabled({ RECODER_UPDATE_FEED: "0" })).toBe(false);
    });

    it("stays enabled for legacy opt-in values", () => {
        expect(updateFeedEnabled({ RECODER_UPDATE_FEED: "1" })).toBe(true);
        expect(updateFeedEnabled({ RECODER_UPDATE_FEED: "on" })).toBe(true);
        expect(updateFeedEnabled({ RECODER_UPDATE_FEED: "https://dl.recoder.xyz/releases" })).toBe(true);
    });
});
