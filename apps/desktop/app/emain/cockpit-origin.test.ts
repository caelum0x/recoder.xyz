// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { isBackendFrameOrigin, isLoopbackFrameUrl } from "./cockpit-origin";

const Backend = "http://127.0.0.1:3100";

describe("isBackendFrameOrigin", () => {
    it("accepts the exact backend origin (cockpit page)", () => {
        expect(isBackendFrameOrigin("http://127.0.0.1:3100/cockpit/", Backend)).toBe(true);
    });

    it("accepts loopback aliases on the same port", () => {
        expect(isBackendFrameOrigin("http://localhost:3100/cockpit/", Backend)).toBe(true);
        expect(isBackendFrameOrigin("http://[::1]:3100/cockpit/", Backend)).toBe(true);
    });

    it("works for non-default backend ports", () => {
        expect(isBackendFrameOrigin("http://localhost:41733/cockpit/", "http://127.0.0.1:41733")).toBe(true);
    });

    it("rejects a different port — another local server never gets the key", () => {
        expect(isBackendFrameOrigin("http://127.0.0.1:8080/", Backend)).toBe(false);
    });

    it("rejects remote sites even on the same port", () => {
        expect(isBackendFrameOrigin("http://evil.example:3100/", Backend)).toBe(false);
        expect(isBackendFrameOrigin("https://evil.example/", Backend)).toBe(false);
    });

    it("rejects a remote host that merely matches the backend hostname rule via loopback spoofing", () => {
        expect(isBackendFrameOrigin("http://localhost.evil.example:3100/", Backend)).toBe(false);
    });

    it("rejects non-http(s) schemes", () => {
        expect(isBackendFrameOrigin("file:///Users/x/index.html", Backend)).toBe(false);
        expect(isBackendFrameOrigin("chrome://settings", Backend)).toBe(false);
    });

    it("rejects unparseable urls without throwing", () => {
        expect(isBackendFrameOrigin("", Backend)).toBe(false);
        expect(isBackendFrameOrigin("not a url", Backend)).toBe(false);
        expect(isBackendFrameOrigin("http://127.0.0.1:3100/", "")).toBe(false);
    });

    it("treats default ports correctly (http 80 / https 443)", () => {
        expect(isBackendFrameOrigin("http://127.0.0.1/", "http://localhost:80")).toBe(true);
        expect(isBackendFrameOrigin("https://127.0.0.1/", "https://localhost")).toBe(true);
        expect(isBackendFrameOrigin("http://127.0.0.1/", Backend)).toBe(false);
    });

    it("matches identical non-loopback hostnames (packaged custom host) but never mixes them with loopback", () => {
        expect(isBackendFrameOrigin("http://backend.internal:3100/", "http://backend.internal:3100")).toBe(true);
        expect(isBackendFrameOrigin("http://backend.internal:3100/", Backend)).toBe(false);
    });
});

describe("isLoopbackFrameUrl", () => {
    it("accepts loopback http frames on any port (readiness-independent status gate)", () => {
        expect(isLoopbackFrameUrl("http://127.0.0.1:3100/cockpit/")).toBe(true);
        expect(isLoopbackFrameUrl("http://localhost:3100/cockpit/")).toBe(true);
        expect(isLoopbackFrameUrl("http://[::1]:41733/cockpit/")).toBe(true);
    });

    it("rejects remote origins even over https", () => {
        expect(isLoopbackFrameUrl("https://evil.example.com/")).toBe(false);
        expect(isLoopbackFrameUrl("http://localhost.evil.example/")).toBe(false);
    });

    it("rejects non-http(s) schemes", () => {
        expect(isLoopbackFrameUrl("file:///x")).toBe(false);
        expect(isLoopbackFrameUrl("chrome://settings")).toBe(false);
    });

    it("rejects unparseable/empty urls without throwing", () => {
        expect(isLoopbackFrameUrl("")).toBe(false);
        expect(isLoopbackFrameUrl("garbage")).toBe(false);
    });
});
