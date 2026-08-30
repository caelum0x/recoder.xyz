// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getRecoderBackendUrl, subscribeRecoderBackendUrl } from "./recoder-endpoints";
import { toWebSocketUrl } from "./recoder-terminal-model";

type BoardLiveWorkspace = { workspaceId: string; state: string };

type BoardLiveChannel = {
    socket: WebSocket | null;
    cursor: number;
    attempt: number;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
};

const LiveWorkspaceStates = new Set([
    "created",
    "setting_up",
    "ready",
    "running",
    "awaiting_approval",
    "changes_requested",
]);
const MaxBoardLiveChannels = 48;
const ReconnectBaseMs = 500;
const ReconnectCapMs = 15_000;

function boardLiveReconnectDelay(attempt: number): number {
    return Math.min(ReconnectCapMs, ReconnectBaseMs * 2 ** Math.max(0, attempt));
}

function buildBoardSyncUrl(base: string, workspaceId: string, cursor?: number): string {
    const query = new URLSearchParams({ workspaceId });
    if (typeof cursor == "number" && Number.isInteger(cursor) && cursor >= 0) {
        query.set("since", String(cursor));
    }
    return `${toWebSocketUrl(base)}/sync?${query.toString()}`;
}

function parseBoardSyncFrame(raw: unknown): { kind: string; seq?: number } | null {
    if (typeof raw != "string") return null;
    try {
        const value = JSON.parse(raw) as { kind?: unknown; seq?: unknown };
        if (value == null || typeof value != "object" || typeof value.kind != "string") return null;
        return {
            kind: value.kind,
            ...(typeof value.seq == "number" && Number.isInteger(value.seq) && value.seq >= 0
                ? { seq: value.seq }
                : {}),
        };
    } catch {
        return null;
    }
}

/**
 * Keeps a bounded set of narrow `/sync` subscriptions for workspaces whose state
 * can still change while the user is away. State/attention frames nudge the
 * Board's canonical HTTP refresh; logs do not, so output cannot cause a refresh
 * storm. The existing poll remains fallback beyond the cap or without WebSocket.
 */
class RecoderBoardLive {
    private readonly onBoardChanged: () => void;
    private readonly channels = new Map<string, BoardLiveChannel>();
    private desired = new Set<string>();
    private disposed = false;
    private readonly unsubscribeBackendUrl: () => void;

    constructor(onBoardChanged: () => void) {
        this.onBoardChanged = onBoardChanged;
        this.unsubscribeBackendUrl = subscribeRecoderBackendUrl(() => this.restart());
    }

    sync(workspaces: readonly BoardLiveWorkspace[]): void {
        if (this.disposed) return;
        this.desired = new Set(
            workspaces
                .filter((workspace) => LiveWorkspaceStates.has(workspace.state))
                .slice(0, MaxBoardLiveChannels)
                .map((workspace) => workspace.workspaceId)
        );
        for (const workspaceId of [...this.channels.keys()]) {
            if (!this.desired.has(workspaceId)) this.closeChannel(workspaceId);
        }
        for (const workspaceId of this.desired) {
            if (!this.channels.has(workspaceId)) this.connect(workspaceId, 0, 0);
        }
    }

    dispose(): void {
        this.disposed = true;
        this.unsubscribeBackendUrl();
        this.desired.clear();
        for (const workspaceId of [...this.channels.keys()]) this.closeChannel(workspaceId);
    }

    private restart(): void {
        const desired = [...this.desired];
        for (const workspaceId of [...this.channels.keys()]) this.closeChannel(workspaceId);
        for (const workspaceId of desired) this.connect(workspaceId, 0, 0);
    }

    private connect(workspaceId: string, cursor: number, attempt: number): void {
        if (this.disposed || !this.desired.has(workspaceId) || typeof WebSocket == "undefined") return;
        let socket: WebSocket;
        try {
            socket = new WebSocket(buildBoardSyncUrl(getRecoderBackendUrl(), workspaceId, cursor || undefined));
        } catch {
            this.scheduleReconnect(workspaceId, cursor, attempt + 1);
            return;
        }
        const channel: BoardLiveChannel = { socket, cursor, attempt, reconnectTimer: null };
        this.channels.set(workspaceId, channel);
        socket.onopen = () => {
            const current = this.channels.get(workspaceId);
            if (current?.socket === socket) current.attempt = 0;
        };
        socket.onmessage = (event: MessageEvent) => {
            const current = this.channels.get(workspaceId);
            if (current?.socket !== socket) return;
            const frame = parseBoardSyncFrame(event.data);
            if (!frame) return;
            if (frame.seq != null) current.cursor = Math.max(current.cursor, frame.seq);
            if (frame.kind === "state" || frame.kind === "attention") this.onBoardChanged();
        };
        socket.onclose = () => this.reconnectClosed(workspaceId, socket);
        socket.onerror = () => socket.close();
    }

    private reconnectClosed(workspaceId: string, socket: WebSocket): void {
        const current = this.channels.get(workspaceId);
        if (current?.socket !== socket) return;
        this.channels.delete(workspaceId);
        if (this.desired.has(workspaceId)) {
            this.scheduleReconnect(workspaceId, current.cursor, current.attempt + 1);
        }
    }

    private scheduleReconnect(workspaceId: string, cursor: number, attempt: number): void {
        if (this.disposed || !this.desired.has(workspaceId)) return;
        const timer = setTimeout(() => {
            const current = this.channels.get(workspaceId);
            if (current?.reconnectTimer === timer) this.channels.delete(workspaceId);
            this.connect(workspaceId, cursor, attempt);
        }, boardLiveReconnectDelay(attempt));
        this.channels.set(workspaceId, { socket: null, cursor, attempt, reconnectTimer: timer });
    }

    private closeChannel(workspaceId: string): void {
        const channel = this.channels.get(workspaceId);
        if (!channel) return;
        this.channels.delete(workspaceId);
        if (channel.reconnectTimer != null) clearTimeout(channel.reconnectTimer);
        if (channel.socket != null) {
            channel.socket.onopen = null;
            channel.socket.onmessage = null;
            channel.socket.onclose = null;
            channel.socket.onerror = null;
            channel.socket.close();
        }
    }
}

export { RecoderBoardLive, buildBoardSyncUrl, parseBoardSyncFrame };
