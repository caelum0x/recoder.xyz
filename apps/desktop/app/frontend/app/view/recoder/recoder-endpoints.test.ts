// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import {
    applyInjectedBackendUrl,
    DefaultRecoderBackend,
    getRecoderBackendUrl,
    initializeRecoderBackendEndpoint,
    setRecoderBackendUrl,
    subscribeRecoderBackendUrl,
} from "./recoder-endpoints";

function clearBackendState(): void {
    setRecoderBackendUrl("");
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

    it("reveals the injected session port after a user override is cleared", () => {
        clearBackendState();
        applyInjectedBackendUrl("http://127.0.0.1:3271");
        setRecoderBackendUrl("http://127.0.0.1:9999");
        expect(getRecoderBackendUrl()).toBe("http://127.0.0.1:9999");

        setRecoderBackendUrl("");
        expect(getRecoderBackendUrl()).toBe("http://127.0.0.1:3271");
    });
});

describe("renderer-wide backend endpoint lifecycle", () => {
    afterEach(clearBackendState);

    it("adopts the synchronous port and later supervisor updates without a view model", () => {
        clearBackendState();
        let pushed: ((url: string) => void) | undefined;
        initializeRecoderBackendEndpoint({
            getRecoderBackendUrl: () => "http://127.0.0.1:3271",
            onRecoderBackendUrl: (callback) => {
                pushed = callback;
            },
        });
        expect(getRecoderBackendUrl()).toBe("http://127.0.0.1:3271");

        pushed?.("http://127.0.0.1:3272");
        expect(getRecoderBackendUrl()).toBe("http://127.0.0.1:3272");
    });

    it("notifies live transports only when the effective endpoint changes", () => {
        clearBackendState();
        const seen: string[] = [];
        const unsubscribe = subscribeRecoderBackendUrl((url) => seen.push(url));
        try {
            applyInjectedBackendUrl("http://127.0.0.1:4100");
            applyInjectedBackendUrl("http://127.0.0.1:4100/");
            setRecoderBackendUrl("http://127.0.0.1:4200");
            expect(seen).toEqual(["http://127.0.0.1:4100", "http://127.0.0.1:4200"]);
        } finally {
            unsubscribe();
        }
    });
});
