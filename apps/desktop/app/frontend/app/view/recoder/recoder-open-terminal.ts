// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createBlock } from "@/app/store/global";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { WorkspaceIdMetaKey } from "./recoder-detail-open";

const OpenWorkspaceTerminalChannel = "recoder:open-workspace-terminal";
const FallbackTmuxBin = "tmux";

// Conductor session names are `<prefix><sessionId>` with everything outside
// [a-zA-Z0-9_-] replaced by "_" (backend tmuxNameFor). A strict allowlist here
// keeps guest-supplied payloads from smuggling tmux flags or target syntax.
const SessionNameRegex = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/;

type OpenWorkspaceTerminalPayload = {
    sessionName: string;
    cwd?: string;
    workspaceId?: string;
    substrate?: string;
};

// The conductor's own tmux server, sourced from its `/health` payload: the pinned
// binary AND (§A1b) the DEFAULT socket it drives. Attaching with both pins the
// wave block to the SAME tmux server the conductor's `recoder-*` sessions live on.
type ConductorTmuxServer = {
    tmuxBin: string;
    tmuxSocket?: string;
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

// The socket path is sourced from the conductor's health payload (never the
// guest), but is still guarded so a malformed value can't smuggle a tmux flag
// into argv. A bad/absent socket is dropped — attach then falls back to tmux's
// own default socket, which is the same server (§A1b mirror), so this is safe.
function sanitizeTmuxSocket(raw: unknown): string | undefined {
    if (typeof raw != "string") {
        return undefined;
    }
    const socket = raw.trim();
    if (socket == "" || socket.startsWith("-") || socket.includes("\0")) {
        return undefined;
    }
    return socket;
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
function buildAttachBlockMeta(
    payload: OpenWorkspaceTerminalPayload,
    tmuxBin: string,
    tmuxSocket?: string,
): Record<string, unknown> {
    // `-S <socket>` is a GLOBAL tmux flag and must precede the command word; it
    // pins attach to the SAME default socket the conductor drives (§A1b). Absent
    // socket ⇒ tmux resolves its own default, so the target server is unchanged.
    const attachArgs = ["attach-session", "-t", payload.sessionName];
    const args = tmuxSocket != null ? ["-S", tmuxSocket, ...attachArgs] : attachArgs;
    const meta: Record<string, unknown> = {
        view: "term",
        controller: "cmd",
        cmd: tmuxBin,
        "cmd:args": args,
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

// The pinned tmux binary AND default socket come from the conductor's own
// `/api/conductor/health` payload (§A1a/§A1b) — NEVER from the caller/guest,
// because `cmd` is the program the term block executes. Sourcing both is what
// makes an "attach to a conductor recoder-* session" open against the SAME tmux
// server the conductor drives instead of a PATH `tmux` on some other socket.
// Degrades truthfully: unreachable backend / missing field ⇒ PATH "tmux" on
// tmux's own default socket (unknown socket is dropped, never guessed).
async function resolveConductorTmuxServer(): Promise<ConductorTmuxServer> {
    try {
        const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/health`);
        const body = await res.json();
        const substrate = body?.data?.substrate;
        const rawBin = substrate?.tmuxBin;
        const tmuxBin = typeof rawBin == "string" && rawBin.trim() != "" ? rawBin.trim() : FallbackTmuxBin;
        const tmuxSocket = sanitizeTmuxSocket(substrate?.tmuxSocket);
        return tmuxSocket != null ? { tmuxBin, tmuxSocket } : { tmuxBin };
    } catch {
        // backend unreachable — PATH tmux on the default socket is the truthful fallback
        return { tmuxBin: FallbackTmuxBin };
    }
}

// Binary-only convenience used by callers that already hold a trusted pin (the
// hub "Terminal" button passes `setup.tmuxBin`); the socket-aware attach goes
// through resolveConductorTmuxServer.
async function resolveConductorTmuxBin(): Promise<string> {
    return (await resolveConductorTmuxServer()).tmuxBin;
}

// Fire-and-forget from event handlers; a failed open must never crash the view.
// Canonical Recoder workspaces open the shared authenticated `/terminal` surface
// regardless of substrate. The cmd/tmux block remains only as a compatibility
// path for older callers that know a session name but not its durable workspace.
async function openWorkspaceTerminal(payload: OpenWorkspaceTerminalPayload, tmuxBin?: string): Promise<void> {
    try {
        const workspaceId = payload.workspaceId?.trim() ?? "";
        if (workspaceId != "") {
            // Build meta as a Record (not a fresh inline literal) so the custom
            // `recoder:workspaceid` key does not trip MetaType's excess-property
            // check — mirrors buildAttachBlockMeta / workspaceDetailMeta.
            const meta: Record<string, unknown> = {
                view: "recoder-loom-terminal",
                [WorkspaceIdMetaKey]: workspaceId,
            };
            await createBlock({ meta });
            return;
        }
        // Loom is not attachable by tmux, and the authenticated renderer needs a
        // workspace id for authorization. Refuse rather than opening the wrong PTY.
        if (payload.substrate == "loom") return;
        if (tmuxBin != null && tmuxBin.trim() != "") {
            await createBlock({ meta: buildAttachBlockMeta(payload, tmuxBin.trim()) });
            return;
        }
        const server = await resolveConductorTmuxServer();
        await createBlock({ meta: buildAttachBlockMeta(payload, server.tmuxBin, server.tmuxSocket) });
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
    resolveConductorTmuxServer,
    sanitizeTmuxSocket,
    type ConductorTmuxServer,
    type OpenWorkspaceTerminalPayload,
};
