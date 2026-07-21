// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Electron-free so the security gate can be unit-tested with plain strings
// (see cockpit-origin.test.ts). The IPC glue lives in emain-ipc.ts.

const LoopbackHostnames = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function isLoopbackHostname(hostname: string): boolean {
    return LoopbackHostnames.has(hostname);
}

function effectivePort(u: URL): string {
    return u.port || (u.protocol === "https:" ? "443" : "80");
}

/**
 * True when the requesting frame is the embedded backend origin (the cockpit
 * page a wave <webview> loaded from http://127.0.0.1:<port>/cockpit/).
 * Hostname equality is relaxed only across loopback aliases (localhost vs
 * 127.0.0.1) — the port must match the backend exactly, so an arbitrary
 * website in a webview can never read the backend api key.
 */
export function isBackendFrameOrigin(frameUrl: string, backendUrl: string): boolean {
    let frame: URL;
    let backend: URL;
    try {
        frame = new URL(frameUrl);
        backend = new URL(backendUrl);
    } catch {
        return false;
    }
    if (frame.protocol !== "http:" && frame.protocol !== "https:") {
        return false;
    }
    if (effectivePort(frame) !== effectivePort(backend)) {
        return false;
    }
    if (frame.hostname === backend.hostname) {
        return true;
    }
    return isLoopbackHostname(frame.hostname) && isLoopbackHostname(backend.hostname);
}

/**
 * True when the requesting frame is a loopback http(s) page, WITHOUT needing to
 * know the backend port. isBackendFrameOrigin() needs the READY backend origin
 * (getBackendAuth().backendUrl), but that is null exactly during the phases we
 * must serve the phase banner for (starting/crashed/failed). The embedded
 * cockpit frame is still the loopback backend origin then — the page stays
 * loaded, only its polls fail — so a readiness-independent loopback-frame check
 * gates the non-secret status projection while auth is still null. The status
 * names only a local log path (no key/URL), so a loopback-frame gate is
 * sufficient; an arbitrary remote webview frame never passes.
 */
export function isLoopbackFrameUrl(frameUrl: string): boolean {
    let frame: URL;
    try {
        frame = new URL(frameUrl);
    } catch {
        return false;
    }
    if (frame.protocol !== "http:" && frame.protocol !== "https:") {
        return false;
    }
    return isLoopbackHostname(frame.hostname);
}
