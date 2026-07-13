// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { RecoderTerminalView } from "./recoder-terminal";

type RecoderTerminalStatus = "idle" | "no-workspace" | "connecting" | "connected" | "closed" | "error";

// Mirror of the backend RunEvent shape (packages/agent-os domain/event.ts). Kept
// as a local structural type so the Wave frontend does not couple to a backend
// package. All fields optional: the socket payload is untrusted external data.
type RecoderRunEvent = {
    eventId?: string;
    type?: string;
    taskId?: string;
    runId?: string;
    agentId?: string;
    state?: string;
    message?: string;
    artifactId?: string;
    createdAt?: string;
    data?: Record<string, unknown>;
};

// The frames attachWorkspaceStream emits (docker-backend conductor/live-events.ts).
type StreamMessage =
    | { type: "event"; event: RecoderRunEvent }
    | { type: "error"; message?: string }
    | { type: "complete" };

const MaxScrollbackLines = 5000;
const WorkspaceIdMetaKey = "recoder:workspaceid";

function toWebSocketUrl(httpUrl: string): string {
    if (httpUrl.startsWith("https://")) return "wss://" + httpUrl.slice("https://".length);
    if (httpUrl.startsWith("http://")) return "ws://" + httpUrl.slice("http://".length);
    return httpUrl;
}

function readWorkspaceId(block: Block): string {
    const meta = (block?.meta ?? {}) as Record<string, unknown>;
    const raw = meta[WorkspaceIdMetaKey];
    return typeof raw === "string" ? raw.trim() : "";
}

function formatTime(iso?: string): string {
    if (!iso) return "--:--:--";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "--:--:--";
    return d.toTimeString().slice(0, 8);
}

function formatEvent(event: RecoderRunEvent): string {
    const ts = formatTime(event.createdAt);
    const kind = typeof event.type === "string" && event.type != "" ? event.type : "event";
    const detail =
        typeof event.message === "string" && event.message != ""
            ? event.message
            : typeof event.state === "string" && event.state != ""
              ? `→ ${event.state}`
              : typeof event.artifactId === "string" && event.artifactId != ""
                ? `artifact ${event.artifactId}`
                : "";
    return detail != "" ? `[${ts}] ${kind}  ${detail}` : `[${ts}] ${kind}`;
}

class RecoderTerminalViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    blockAtom: Atom<Block>;
    linesAtom: PrimitiveAtom<string[]>;
    statusAtom: PrimitiveAtom<RecoderTerminalStatus>;
    errorAtom: PrimitiveAtom<string>;
    workspaceIdAtom: PrimitiveAtom<string>;
    sendingAtom: PrimitiveAtom<boolean>;
    sendStatusAtom: PrimitiveAtom<string>;
    socket: WebSocket;
    disposed: boolean;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-terminal";
        this.viewIcon = atom("terminal");
        this.viewName = atom("Recoder Session");
        this.blockAtom = initOpts.waveEnv.wos.getWaveObjectAtom<Block>(`block:${initOpts.blockId}`);
        this.linesAtom = atom([]) as PrimitiveAtom<string[]>;
        this.statusAtom = atom("idle") as PrimitiveAtom<RecoderTerminalStatus>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.workspaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.sendingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.sendStatusAtom = atom("") as PrimitiveAtom<string>;
        this.socket = null;
        this.disposed = false;
    }

    get viewComponent(): ViewComponent {
        return RecoderTerminalView;
    }

    connect(): void {
        if (this.disposed) return;
        this.teardownSocket();

        const block = globalStore.get(this.blockAtom);
        const workspaceId = readWorkspaceId(block);
        globalStore.set(this.workspaceIdAtom, workspaceId);
        globalStore.set(this.errorAtom, "");

        if (workspaceId == "") {
            globalStore.set(this.statusAtom, "no-workspace");
            return;
        }
        if (typeof WebSocket == "undefined") {
            globalStore.set(this.statusAtom, "error");
            globalStore.set(this.errorAtom, "WebSocket is not available in this environment");
            return;
        }

        const url = `${toWebSocketUrl(getRecoderBackendUrl())}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/stream`;
        globalStore.set(this.statusAtom, "connecting");

        let socket: WebSocket;
        try {
            socket = new WebSocket(url);
        } catch (e) {
            globalStore.set(this.statusAtom, "error");
            globalStore.set(this.errorAtom, e instanceof Error ? e.message : String(e));
            return;
        }
        this.socket = socket;

        socket.onopen = () => {
            if (this.socket !== socket) return;
            globalStore.set(this.statusAtom, "connected");
        };
        socket.onmessage = (ev: MessageEvent) => {
            if (this.socket !== socket) return;
            this.handleMessage(ev.data);
        };
        socket.onerror = () => {
            if (this.socket !== socket) return;
            globalStore.set(this.statusAtom, "error");
            if (globalStore.get(this.errorAtom) == "") {
                globalStore.set(this.errorAtom, "connection error — is the Recoder backend running?");
            }
        };
        socket.onclose = () => {
            if (this.socket !== socket) return;
            this.socket = null;
            if (this.disposed) return;
            if (globalStore.get(this.statusAtom) != "error") {
                globalStore.set(this.statusAtom, "closed");
            }
        };
    }

    handleMessage(raw: unknown): void {
        if (typeof raw != "string") return;
        let msg: StreamMessage;
        try {
            msg = JSON.parse(raw) as StreamMessage;
        } catch {
            return;
        }
        if (msg == null || typeof msg != "object") return;

        if (msg.type == "event" && msg.event != null) {
            this.appendLine(formatEvent(msg.event));
            return;
        }
        if (msg.type == "error") {
            const m = typeof msg.message == "string" && msg.message != "" ? msg.message : "stream error";
            globalStore.set(this.errorAtom, m);
            this.appendLine(`[stream error] ${m}`);
            return;
        }
        if (msg.type == "complete") {
            this.appendLine("[stream complete]");
        }
    }

    appendLine(text: string): void {
        const prev = globalStore.get(this.linesAtom);
        const next =
            prev.length >= MaxScrollbackLines
                ? [...prev.slice(prev.length - MaxScrollbackLines + 1), text]
                : [...prev, text];
        globalStore.set(this.linesAtom, next);
    }

    // Send a follow-up instruction: POST it as a NEW agent run in the same
    // workspace. The agent's response streams back through the existing socket,
    // so we never re-render the scrollback here. Returns true on success so the
    // component can clear the input. Degrade-safe: every failure path surfaces a
    // truthful status; we never fabricate a green.
    async sendMessage(text: string): Promise<boolean> {
        const trimmed = text.trim();
        if (trimmed == "") return false;
        if (globalStore.get(this.sendingAtom)) return false;

        const workspaceId = globalStore.get(this.workspaceIdAtom);
        if (workspaceId == "") {
            globalStore.set(this.sendStatusAtom, "send failed: no workspace bound");
            return false;
        }

        globalStore.set(this.sendingAtom, true);
        globalStore.set(this.sendStatusAtom, "sending…");

        const url = `${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/message`;
        try {
            const resp = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: trimmed }),
            });
            if (!resp.ok) {
                const reason = await this.readErrorReason(resp);
                globalStore.set(this.sendStatusAtom, `send failed: ${reason}`);
                return false;
            }
            globalStore.set(this.sendStatusAtom, "sent — awaiting agent response");
            return true;
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            globalStore.set(this.sendStatusAtom, `send failed: ${reason}`);
            return false;
        } finally {
            globalStore.set(this.sendingAtom, false);
        }
    }

    async readErrorReason(resp: Response): Promise<string> {
        try {
            const body = (await resp.json()) as { error?: unknown };
            if (typeof body?.error == "string" && body.error != "") return body.error;
        } catch {
            /* non-JSON body */
        }
        return `HTTP ${resp.status}`;
    }

    teardownSocket(): void {
        const socket = this.socket;
        this.socket = null;
        if (socket == null) return;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
            socket.close();
        } catch {
            /* already closed */
        }
    }

    dispose(): void {
        this.disposed = true;
        this.teardownSocket();
    }
}

export { RecoderTerminalViewModel, type RecoderTerminalStatus, toWebSocketUrl };
