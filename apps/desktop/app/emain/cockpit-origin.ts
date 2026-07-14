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
