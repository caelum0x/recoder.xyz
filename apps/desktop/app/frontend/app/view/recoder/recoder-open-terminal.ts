// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";
import { getRecoderBackendUrl } from "./recoder-endpoints";

const OpenWorkspaceTerminalChannel = "recoder:open-workspace-terminal";
const FallbackTmuxBin = "tmux";

// Conductor session names are `<prefix><sessionId>` with everything outside
// [a-zA-Z0-9_-] replaced by "_" (backend tmuxNameFor). A strict allowlist here
// keeps guest-supplied payloads from smuggling tmux flags or target syntax.
const SessionNameRegex = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/;

type OpenWorkspaceTerminalPayload = {
    sessionName: string;
    cwd?: string;
};

// The cwd rides into cmd:cwd (argv, no shell), so the only hard requirements are
// "plausible absolute path" and "not flag-shaped". A bad cwd is dropped rather
// than rejecting the whole request — tmux attach works from any directory.
function sanitizeCwd(raw: unknown): string | undefined {
    if (typeof raw != "string") {
        return undefined;
    }
    const cwd = raw.trim();
    if (cwd == "" || cwd.startsWith("-") || cwd.includes("\0")) {
        return undefined;
    }
    return cwd;
}

function parseOpenWorkspaceTerminalPayload(raw: unknown): OpenWorkspaceTerminalPayload | null {
    if (raw == null || typeof raw != "object") {
        return null;
    }
    const obj = raw as { sessionName?: unknown; cwd?: unknown };
    if (typeof obj.sessionName != "string" || !SessionNameRegex.test(obj.sessionName)) {
        return null;
    }
    const payload: OpenWorkspaceTerminalPayload = { sessionName: obj.sessionName };
    const cwd = sanitizeCwd(obj.cwd);
    if (cwd != null) {
        payload.cwd = cwd;
    }
    return payload;
}

// cmd:runonstart=true + cmd:runonce=false is deliberate (differs from `wsh run`):
// the tmux session outlives the app, so the block should re-attach after relaunch.
function buildAttachBlockMeta(payload: OpenWorkspaceTerminalPayload, tmuxBin: string): Record<string, unknown> {
    const meta: Record<string, unknown> = {
        view: "term",
        controller: "cmd",
        cmd: tmuxBin,
        "cmd:args": ["attach-session", "-t", payload.sessionName],
        "cmd:shell": false,
        "cmd:runonstart": true,
        "cmd:runonce": false,
        "cmd:clearonstart": true,
    };
    if (payload.cwd != null) {
        meta["cmd:cwd"] = payload.cwd;
    }
    return meta;
}

// The pinned tmux path comes from the conductor's own health payload
// (CONDUCTOR_TMUX_BIN / engines tmux) — NEVER from the caller/guest, because
// `cmd` is the program the term block executes. Degrades to PATH "tmux".
async function resolveConductorTmuxBin(): Promise<string> {
    try {
        const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/health/full`);
        const body = await res.json();
        const tmuxBin = body?.data?.substrate?.tmuxBin;
        if (typeof tmuxBin == "string" && tmuxBin.trim() != "") {
            return tmuxBin.trim();
        }
    } catch {
        // backend unreachable — PATH tmux is the truthful fallback
    }
    return FallbackTmuxBin;
}

// Fire-and-forget from event handlers; a failed open must never crash the view.
async function openWorkspaceTerminal(payload: OpenWorkspaceTerminalPayload, tmuxBin?: string): Promise<void> {
    try {
        const bin = tmuxBin && tmuxBin.trim() != "" ? tmuxBin.trim() : await resolveConductorTmuxBin();
        await createBlock({ meta: buildAttachBlockMeta(payload, bin) });
    } catch {
        // degrade-safe: opening a block should never take down the calling view
    }
}

function isLoopbackHostname(hostname: string): boolean {
    return hostname == "127.0.0.1" || hostname == "localhost" || hostname == "[::1]" || hostname == "::1";
}

// The cockpit is served by the embedded backend, so a guest is trusted when its
// origin matches the configured backend origin (127.0.0.1/localhost treated as
// the same loopback host). Everything else — arbitrary webview pages — is not.
function isTrustedCockpitOrigin(guestUrl: string): boolean {
    let guest: URL;
    let backend: URL;
    try {
        guest = new URL(guestUrl);
        backend = new URL(getRecoderBackendUrl());
    } catch {
        return false;
    }
    if (guest.protocol != backend.protocol || guest.port != backend.port) {
        return false;
    }
    if (guest.hostname == backend.hostname) {
        return true;
    }
    return isLoopbackHostname(guest.hostname) && isLoopbackHostname(backend.hostname);
}

// Host-side entry for the webview `ipc-message` bridge. This is the trust
// boundary: the guest page (cockpit) only ever sends a request; origin + payload
// are validated here and tmuxBin is resolved from the backend, not the guest.
// Returns whether a block open was attempted (for tests / callers).
async function handleOpenWorkspaceTerminalIpc(guestUrl: string, rawPayload: unknown): Promise<boolean> {
    if (!isTrustedCockpitOrigin(guestUrl)) {
        return false;
    }
    const payload = parseOpenWorkspaceTerminalPayload(rawPayload);
    if (payload == null) {
        return false;
    }
    await openWorkspaceTerminal(payload);
    return true;
}

export {
    buildAttachBlockMeta,
    handleOpenWorkspaceTerminalIpc,
    isTrustedCockpitOrigin,
    openWorkspaceTerminal,
    OpenWorkspaceTerminalChannel,
    parseOpenWorkspaceTerminalPayload,
    resolveConductorTmuxBin,
    type OpenWorkspaceTerminalPayload,
};
