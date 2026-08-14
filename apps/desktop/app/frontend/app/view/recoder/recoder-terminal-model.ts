// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { type MeteringDisplay } from "./recoder-metering";
import { describeRunEvent, formatRunEventLine, type RunEventDescriptor } from "./recoder-run-event";
import { RecoderTerminalView } from "./recoder-terminal";
import { fetchWorkspaceUsage } from "./recoder-usage-strip";

// A structured entry the rich run view renders: either a classified RunEvent
// (rendered as an icon/severity block, with inline approve/deny when it carries a
// decidable approvalId) or a system line (stream error/complete).
type RunStreamEntry =
    | { kind: "event"; descriptor: RunEventDescriptor }
    | { kind: "system"; text: string; tone: "error" | "muted" };

type RecoderTerminalStatus = "idle" | "no-workspace" | "connecting" | "connected" | "closed" | "error";

// A lenient subset of the conductor Workspace record, folded from the SAME list
// edge Review uses, so the shared detail header's switcher + identity read
// identically in Session and Review. Everything past the id is optional — an
// older/newer backend degrades to "just the id", never a fabricated field.
type TerminalWorkspaceSummary = {
    workspaceId: string;
    branch: string;
    state: string;
    runtimeId: string;
    projectId?: string;
    sessionName?: string;
    worktreePath?: string;
};

// The cost/token strip's truthful state: idle (no workspace / not asked yet),
// ready (a real scoped payload rendered), unavailable (the usage read failed —
// shown as "usage unavailable", NEVER as a fake all-zero strip).
type UsageStripStatus = "idle" | "ready" | "unavailable";

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

// The frames attachWorkspaceStream emits (backend conductor/live-events.ts).
// LEGACY: the live backend does not wrap — its /stream WS fans out FULL
// RunEvents as bare JSON (live-events.ts publishRaw), so bare frames are the
// primary shape and this envelope is only tolerated for older backends.
type StreamMessage =
    | { type: "event"; event: RecoderRunEvent }
    | { type: "error"; message?: string }
    | { type: "complete" };

type ParsedStreamFrame =
    | { kind: "event"; event: RecoderRunEvent }
    | { kind: "error"; message: string }
    | { kind: "complete" };

const MaxScrollbackLines = 5000;
const ReconnectBaseMs = 500;
const ReconnectCapMs = 15_000;
const MaxReconnectAttempts = 6;

// Capped exponential backoff with jitter for the run-event socket (pure/testable):
// the delay for `attempt` falls within [half, full] of min(cap, base * 2^attempt),
// so a backend crash-restart or loopback blip recovers without a thundering herd.
function reconnectDelayMs(attempt: number): number {
    const ceiling = Math.min(ReconnectCapMs, ReconnectBaseMs * 2 ** Math.max(0, attempt));
    return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}
const WorkspaceIdMetaKey = "recoder:workspaceid";
// RunEventType values from packages/agent-os domain/event.ts, mirrored (like
// RecoderRunEvent above) so bare frames can be recognized without coupling to
// the backend package.
const RunEventTypes = new Set<string>([
    "started",
    "state_transition",
    "log",
    "user_message",
    "artifact",
    "needs_input",
    "verified",
    "approval_requested",
    "handoff",
    "failed",
    "completed",
]);

function toWebSocketUrl(httpUrl: string): string {
    if (httpUrl.startsWith("https://")) return "wss://" + httpUrl.slice("https://".length);
    if (httpUrl.startsWith("http://")) return "ws://" + httpUrl.slice("http://".length);
    return httpUrl;
}

// A resume cursor is the numeric `seq` DT-7.3a stamps on each run-event frame;
// only a finite non-negative integer is a real cursor (0 replays all retained).
function isResumeCursor(value: unknown): value is number {
    return typeof value == "number" && Number.isInteger(value) && value >= 0;
}

// Build the workspace run-event stream URL, appending `?since=<cursor>` only for
// a valid cursor so a reconnect replays buffered frames while a fresh connect
// (no cursor) stays live-only — garbage never leaks into the query.
function buildStreamUrl(base: string, workspaceId: string, sinceId?: number): string {
    const url = `${toWebSocketUrl(base)}/api/conductor/workspaces/${encodeURIComponent(workspaceId)}/stream`;
    if (!isResumeCursor(sinceId)) return url;
    return `${url}?since=${sinceId}`;
}

function readWorkspaceId(block: Block): string {
    const meta = (block?.meta ?? {}) as Record<string, unknown>;
    const raw = meta[WorkspaceIdMetaKey];
    return typeof raw === "string" ? raw.trim() : "";
}

function formatEvent(event: RecoderRunEvent): string {
    return formatRunEventLine(describeRunEvent(event));
}

function parseStreamFrame(raw: unknown): ParsedStreamFrame {
    if (typeof raw != "string") return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (parsed == null || typeof parsed != "object") return null;
    const type = (parsed as { type?: unknown }).type;
    if (typeof type != "string") return null;
    if (RunEventTypes.has(type)) {
        return { kind: "event", event: parsed as RecoderRunEvent };
    }
    const legacy = parsed as StreamMessage;
    if (legacy.type == "event" && legacy.event != null) {
        return { kind: "event", event: legacy.event };
    }
    if (legacy.type == "error") {
        const message = typeof legacy.message == "string" && legacy.message != "" ? legacy.message : "stream error";
        return { kind: "error", message };
    }
    if (legacy.type == "complete") {
        return { kind: "complete" };
    }
    return null;
}

class RecoderTerminalViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    blockAtom: Atom<Block>;
    linesAtom: PrimitiveAtom<string[]>;
    entriesAtom: PrimitiveAtom<RunStreamEntry[]>;
    statusAtom: PrimitiveAtom<RecoderTerminalStatus>;
    errorAtom: PrimitiveAtom<string>;
    workspaceIdAtom: PrimitiveAtom<string>;
    workspacesAtom: PrimitiveAtom<TerminalWorkspaceSummary[]>;
    sendingAtom: PrimitiveAtom<boolean>;
    sendStatusAtom: PrimitiveAtom<string>;
    usageAtom: PrimitiveAtom<MeteringDisplay>;
    usageStatusAtom: PrimitiveAtom<UsageStripStatus>;
    socket: WebSocket;
    disposed: boolean;
    reconnectAttempt: number;
    lastEventId: number;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    // In-place workspace override for the switcher: "" ⇒ connect() reads the id
    // from block meta (the launched binding); a non-empty value ⇒ the operator
    // switched this Session to another workspace without opening a new block.
    boundWorkspaceId: string;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-terminal";
        this.viewIcon = atom("terminal");
        this.viewName = atom("Recoder Session");
        this.blockAtom = initOpts.waveEnv.wos.getWaveObjectAtom<Block>(`block:${initOpts.blockId}`);
        this.linesAtom = atom([]) as PrimitiveAtom<string[]>;
        this.entriesAtom = atom([]) as PrimitiveAtom<RunStreamEntry[]>;
        this.statusAtom = atom("idle") as PrimitiveAtom<RecoderTerminalStatus>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.workspaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.workspacesAtom = atom([]) as PrimitiveAtom<TerminalWorkspaceSummary[]>;
        this.sendingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.sendStatusAtom = atom("") as PrimitiveAtom<string>;
        this.usageAtom = atom(null) as PrimitiveAtom<MeteringDisplay>;
        this.usageStatusAtom = atom("idle") as PrimitiveAtom<UsageStripStatus>;
        this.socket = null;
        this.disposed = false;
        this.reconnectAttempt = 0;
        this.lastEventId = 0;
        this.reconnectTimer = null;
        this.boundWorkspaceId = "";
    }

    get viewComponent(): ViewComponent {
        return RecoderTerminalView;
    }

    connect(isRetry = false): void {
        if (this.disposed) return;
        this.clearReconnectTimer();
        // A manual (re)connect resets the backoff budget and resume cursor; an
        // auto-retry preserves both so buffered frames replay from ?since.
        if (!isRetry) {
            this.reconnectAttempt = 0;
            this.lastEventId = 0;
        }
        this.teardownSocket();

        const block = globalStore.get(this.blockAtom);
        const workspaceId = this.boundWorkspaceId != "" ? this.boundWorkspaceId : readWorkspaceId(block);
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

        const url = buildStreamUrl(getRecoderBackendUrl(), workspaceId, isRetry ? this.lastEventId : undefined);
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
            this.reconnectAttempt = 0;
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
                globalStore.set(this.errorAtom, "connection error — is Recoder running?");
            }
        };
        socket.onclose = () => {
            if (this.socket !== socket) return;
            this.socket = null;
            if (this.disposed) return;
            // An unexpected close (deliberate teardown nulls this handler first) —
            // auto-reconnect with capped backoff instead of sitting dead.
            this.scheduleReconnect();
        };
    }

    // Reconnect the run-event socket after an unexpected drop, with capped
    // exponential backoff + jitter; give up truthfully after MaxReconnectAttempts
    // so the view shows "press Reconnect" rather than spinning forever.
    scheduleReconnect(): void {
        if (this.disposed) return;
        this.clearReconnectTimer();
        if (this.reconnectAttempt >= MaxReconnectAttempts) {
            globalStore.set(this.statusAtom, "closed");
            if (globalStore.get(this.errorAtom) == "") {
                globalStore.set(this.errorAtom, "disconnected — press Reconnect to resume the stream");
            }
            return;
        }
        const delay = reconnectDelayMs(this.reconnectAttempt);
        globalStore.set(this.statusAtom, "connecting");
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnectAttempt += 1;
            this.connect(true);
        }, delay);
    }

    clearReconnectTimer(): void {
        if (this.reconnectTimer != null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    handleMessage(raw: unknown): void {
        const frame = parseStreamFrame(raw);
        if (frame == null) return;
        if (frame.kind == "event") {
            // Track the transport's `seq` (DT-7.3a) as the resume cursor so a
            // reconnect can replay from ?since without a gap or duplicate.
            const seq = (frame.event as { seq?: unknown }).seq;
            if (isResumeCursor(seq)) this.lastEventId = seq;
            // A bare completed/failed event renders as a line and nothing more:
            // the socket is workspace-scoped and follow-up sendMessage runs
            // stream through it, so a finished RUN must not close the stream.
            this.appendLine(formatEvent(frame.event));
            this.appendEntry({ kind: "event", descriptor: describeRunEvent(frame.event) });
            return;
        }
        if (frame.kind == "error") {
            globalStore.set(this.errorAtom, frame.message);
            this.appendLine(`[stream error] ${frame.message}`);
            this.appendEntry({ kind: "system", text: `[stream error] ${frame.message}`, tone: "error" });
            return;
        }
        this.appendLine("[stream complete]");
        this.appendEntry({ kind: "system", text: "[stream complete]", tone: "muted" });
    }

    appendLine(text: string): void {
        const prev = globalStore.get(this.linesAtom);
        const next =
            prev.length >= MaxScrollbackLines
                ? [...prev.slice(prev.length - MaxScrollbackLines + 1), text]
                : [...prev, text];
        globalStore.set(this.linesAtom, next);
    }

    appendEntry(entry: RunStreamEntry): void {
        const prev = globalStore.get(this.entriesAtom);
        const next =
            prev.length >= MaxScrollbackLines
                ? [...prev.slice(prev.length - MaxScrollbackLines + 1), entry]
                : [...prev, entry];
        globalStore.set(this.entriesAtom, next);
    }

    // (Re)load this workspace's scoped cost/token usage for the strip. Guards
    // against a stale in-flight read by re-checking the bound workspace after the
    // await, so a rebind never lets an older workspace's numbers render. null from
    // the fetch means the read failed → "unavailable", never a faked zero strip.
    async refreshUsage(): Promise<void> {
        const workspaceId = globalStore.get(this.workspaceIdAtom);
        if (workspaceId == "") {
            globalStore.set(this.usageAtom, null);
            globalStore.set(this.usageStatusAtom, "idle");
            return;
        }
        const display = await fetchWorkspaceUsage(getRecoderBackendUrl(), workspaceId);
        if (this.disposed || globalStore.get(this.workspaceIdAtom) != workspaceId) return;
        globalStore.set(this.usageAtom, display);
        globalStore.set(this.usageStatusAtom, display == null ? "unavailable" : "ready");
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

    // Fold the workspace list from the SAME edge Review reads, for the shared
    // header's switcher + identity. Degrade-safe: a failed/odd-shaped read leaves
    // the switcher as-is (the header still shows the bound id) — never a fake row.
    async refreshWorkspaces(): Promise<void> {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces`);
            const body = await res.json();
            const data = body?.data;
            const list = Array.isArray(data?.workspaces) ? data.workspaces : Array.isArray(data) ? data : [];
            const workspaces = (list as TerminalWorkspaceSummary[]).filter((w) => w.state != "archived");
            if (this.disposed) return;
            globalStore.set(this.workspacesAtom, workspaces);
        } catch {
            // list unavailable — keep whatever the switcher had; never fabricate one
        }
    }

    // Switch this Session to another workspace IN-PLACE (mirrors Review's switcher
    // so the two faces feel identical): rebind, clear the previous workspace's
    // scrollback + usage so they can't bleed into the new stream, then reconnect.
    // A no-op when the id is unchanged or empty.
    switchWorkspace(workspaceId: string): void {
        const next = workspaceId.trim();
        if (next == "" || next == globalStore.get(this.workspaceIdAtom)) return;
        this.boundWorkspaceId = next;
        globalStore.set(this.linesAtom, []);
        globalStore.set(this.entriesAtom, []);
        globalStore.set(this.usageAtom, null);
        globalStore.set(this.usageStatusAtom, "idle");
        this.connect();
    }

    dispose(): void {
        this.disposed = true;
        this.clearReconnectTimer();
        this.teardownSocket();
    }
}

export {
    buildStreamUrl,
    parseStreamFrame,
    reconnectDelayMs,
    RecoderTerminalViewModel,
    toWebSocketUrl,
    type ParsedStreamFrame,
    type RecoderRunEvent,
    type RecoderTerminalStatus,
    type RunStreamEntry,
    type TerminalWorkspaceSummary,
    type UsageStripStatus,
};
