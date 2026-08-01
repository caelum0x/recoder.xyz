// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const DefaultRecoderBackend = "http://127.0.0.1:3100";
const BackendUrlStorageKey = "recoder:backendurl";

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
    const fromWindow = (globalThis as { __RECODER_BACKEND_URL__?: unknown }).__RECODER_BACKEND_URL__;
    if (fromWindow) {
        return trimTrailingSlash(String(fromWindow));
    }
    return DefaultRecoderBackend;
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
    (globalThis as { __RECODER_BACKEND_URL__?: unknown }).__RECODER_BACKEND_URL__ = clean;
    return true;
}

// Persist a user backend-URL override (settings block). Empty clears the override
// (reverts to window/default). Also mirrors to the window global for this session.
// Degrade-safe: a localStorage failure is swallowed.
function setRecoderBackendUrl(url: string): void {
    const clean = trimTrailingSlash((url ?? "").trim());
    try {
        if (clean == "") {
            globalThis.localStorage?.removeItem(BackendUrlStorageKey);
        } else {
            globalThis.localStorage?.setItem(BackendUrlStorageKey, clean);
        }
    } catch {
        // ignore — the window mirror below still applies for this session
    }
    (globalThis as { __RECODER_BACKEND_URL__?: unknown }).__RECODER_BACKEND_URL__ = clean == "" ? undefined : clean;
}

export { getRecoderBackendUrl, setRecoderBackendUrl, applyInjectedBackendUrl, DefaultRecoderBackend };
