// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import {
    applyInjectedBackendUrl,
    DefaultRecoderBackend,
    getRecoderBackendUrl,
    setRecoderBackendUrl,
} from "./recoder-endpoints";

function clearBackendState(): void {
    (globalThis as { __RECODER_BACKEND_URL__?: unknown }).__RECODER_BACKEND_URL__ = undefined;
    try {
        globalThis.localStorage?.removeItem("recoder:backendurl");
    } catch {
        // no localStorage in this context
    }
}

describe("getRecoderBackendUrl resolution order", () => {
    afterEach(clearBackendState);

    it("falls back to the loopback default with no override or injection", () => {
        clearBackendState();
        expect(getRecoderBackendUrl()).toBe(DefaultRecoderBackend);
    });

    it("uses a persisted user override over everything else", () => {
        // The renderer has localStorage; the node test env does not, so stub a
        // Map-backed store to exercise the real resolution order (override first).
        const store = new Map<string, string>();
        const original = (globalThis as { localStorage?: Storage }).localStorage;
        (globalThis as { localStorage?: unknown }).localStorage = {
            getItem: (k: string) => (store.has(k) ? store.get(k) : null),
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        };
        try {
            setRecoderBackendUrl("http://127.0.0.1:9999");
            applyInjectedBackendUrl("http://127.0.0.1:3271");
            // localStorage is checked first, so a user override wins over the injected session port.
            expect(getRecoderBackendUrl()).toBe("http://127.0.0.1:9999");
        } finally {
            (globalThis as { localStorage?: unknown }).localStorage = original;
        }
    });
});

describe("applyInjectedBackendUrl (DT-7.1 main-process port injection)", () => {
    afterEach(clearBackendState);

    it("applies a real injected URL for this session (reassigned backend port)", () => {
        clearBackendState();
        expect(applyInjectedBackendUrl("http://127.0.0.1:3271")).toBe(true);
        expect(getRecoderBackendUrl()).toBe("http://127.0.0.1:3271");
    });

    it("trims a trailing slash", () => {
        clearBackendState();
        applyInjectedBackendUrl("http://127.0.0.1:3271/");
        expect(getRecoderBackendUrl()).toBe("http://127.0.0.1:3271");
    });

    it("ignores a null/blank/non-string injection (backend not ready yet)", () => {
        clearBackendState();
        expect(applyInjectedBackendUrl(null)).toBe(false);
        expect(applyInjectedBackendUrl("")).toBe(false);
        expect(applyInjectedBackendUrl("   ")).toBe(false);
        expect(applyInjectedBackendUrl(3271 as unknown)).toBe(false);
        expect(getRecoderBackendUrl()).toBe(DefaultRecoderBackend);
    });

    it("does NOT persist the injected port into a future session (window-global only)", () => {
        clearBackendState();
        applyInjectedBackendUrl("http://127.0.0.1:3271");
        let stored: string | null = "unset";
        try {
            stored = globalThis.localStorage?.getItem("recoder:backendurl") ?? null;
        } catch {
            stored = null;
        }
        expect(stored == null || stored == "").toBe(true);
    });
});
