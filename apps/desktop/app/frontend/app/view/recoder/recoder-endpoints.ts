// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const DefaultRecoderBackend = "http://127.0.0.1:3100";
const BackendUrlStorageKey = "recoder:backendurl";
const backendUrlListeners = new Set<(url: string) => void>();
let backendBridgeInitialized = false;
let volatileUserOverride: string | null = null;

type RecoderBackendBridge = {
    getRecoderBackendUrl?: () => unknown;
    onRecoderBackendUrl?: (callback: (url: string) => void) => void;
};

function trimTrailingSlash(url: string): string {
    return url.replace(/\/+$/, "");
}

// Resolution order: a user override persisted in localStorage (set via the
// settings block), then an injected window global, then the loopback default.
// Any read failure (no localStorage in this context) degrades to the next source.
function getRecoderBackendUrl(): string {
    try {
        const stored = globalThis.localStorage?.getItem(BackendUrlStorageKey);
        if (stored && stored.trim() != "") {
            return trimTrailingSlash(stored.trim());
        }
    } catch {
        // no localStorage (e.g. preview harness) — fall through
    }
    if (volatileUserOverride != null) {
        return volatileUserOverride;
    }
    const fromWindow = (globalThis as { __RECODER_BACKEND_URL__?: unknown }).__RECODER_BACKEND_URL__;
    if (fromWindow) {
        return trimTrailingSlash(String(fromWindow));
    }
    return DefaultRecoderBackend;
}

function notifyBackendUrlChanged(previous: string): void {
    const current = getRecoderBackendUrl();
    if (current == previous) {
        return;
    }
    for (const listener of backendUrlListeners) {
        try {
            listener(current);
        } catch {
            // One view transport must not prevent remaining clients from moving.
        }
    }
}

// Apply a backend URL the MAIN PROCESS injected for THIS session (DT-7.1): the
// embedded backend supervisor prefers port 3100 but falls back to a free port
// when 3100 is taken, so the loopback default would target the wrong port. This
// sets ONLY the session window-global — never localStorage — so (a) a user's
// explicit override still wins (getRecoderBackendUrl checks localStorage first),
// and (b) the per-session port is never persisted into a future session. A blank
// or non-string injection is ignored (returns false), so a not-yet-ready backend
// leaves the existing resolution untouched.
function applyInjectedBackendUrl(injected: unknown): boolean {
    if (typeof injected != "string") {
        return false;
    }
    const clean = trimTrailingSlash(injected.trim());
    if (clean == "") {
        return false;
    }
    const previous = getRecoderBackendUrl();
    (globalThis as { __RECODER_BACKEND_URL__?: unknown }).__RECODER_BACKEND_URL__ = clean;
    notifyBackendUrlChanged(previous);
    return true;
}

// Persist a user backend-URL override (settings block). Empty clears ONLY that
// override and reveals the supervisor-injected session URL again. The volatile
// mirror keeps settings functional when localStorage is unavailable without
// conflating user authority with the injected port.
function setRecoderBackendUrl(url: string): void {
    const clean = trimTrailingSlash((url ?? "").trim());
    const previous = getRecoderBackendUrl();
    try {
        if (clean == "") {
            globalThis.localStorage?.removeItem(BackendUrlStorageKey);
        } else {
            globalThis.localStorage?.setItem(BackendUrlStorageKey, clean);
        }
    } catch {
        // ignore — the volatile mirror below still applies for this session
    }
    volatileUserOverride = clean == "" ? null : clean;
    notifyBackendUrlChanged(previous);
}

// Initialize endpoint discovery once for every renderer, independently of which
// Recoder view happens to mount first. This closes a startup race where a Session,
// Review, or Loom block could miss the main-process READY broadcast because the
// identity model (the old subscriber) had never been constructed.
function initializeRecoderBackendEndpoint(bridge: RecoderBackendBridge | null | undefined): void {
    if (backendBridgeInitialized || bridge == null) {
        return;
    }
    backendBridgeInitialized = true;
    try {
        applyInjectedBackendUrl(bridge.getRecoderBackendUrl?.());
    } catch {
        // A failed synchronous read must not prevent the READY push subscription.
    }
    try {
        bridge.onRecoderBackendUrl?.((url) => {
            applyInjectedBackendUrl(url);
        });
    } catch {
        // No preload bridge (preview/test) — keep override/window/default resolution.
    }
}

function subscribeRecoderBackendUrl(listener: (url: string) => void): () => void {
    backendUrlListeners.add(listener);
    return () => backendUrlListeners.delete(listener);
}

export {
    DefaultRecoderBackend,
    applyInjectedBackendUrl,
    getRecoderBackendUrl,
    initializeRecoderBackendEndpoint,
    setRecoderBackendUrl,
    subscribeRecoderBackendUrl,
};
