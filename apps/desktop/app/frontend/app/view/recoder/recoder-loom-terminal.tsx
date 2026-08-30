// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { base64ToArray } from "@/util/util";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import "../term/xterm.css";
import { getRecoderBackendUrl, subscribeRecoderBackendUrl } from "./recoder-endpoints";
import type { RecoderLoomTerminalViewModel } from "./recoder-loom-terminal-model";
import { toWebSocketUrl } from "./recoder-terminal-model";

type TerminalState = "connecting" | "connected" | "closed" | "error";
const LoomReconnectBaseMs = 500;
const LoomReconnectCapMs = 15_000;
const MaxLoomReconnectAttempts = 6;

function loomReconnectDelayMs(attempt: number): number {
    return Math.min(LoomReconnectCapMs, LoomReconnectBaseMs * 2 ** Math.max(0, attempt));
}

function decodeBase64(value: string): Uint8Array | null {
    try {
        return base64ToArray(value);
    } catch {
        return null;
    }
}

function RecoderLoomTerminalView({ model }: ViewComponentProps<RecoderLoomTerminalViewModel>) {
    const hostRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const connectRef = useRef<() => void>(() => {});
    const [state, setState] = useState<TerminalState>("connecting");
    const workspaceId = model.workspaceId();

    useEffect(() => {
        const host = hostRef.current;
        if (host == null || workspaceId == "") {
            setState("error");
            return;
        }

        const terminal = new Terminal({
            allowProposedApi: false,
            convertEol: false,
            cursorBlink: true,
            cursorStyle: "block",
            fontFamily: '"Berkeley Mono", "JetBrains Mono", monospace',
            fontSize: 13,
            lineHeight: 1.12,
            scrollback: 10_000,
            theme: {
                background: "#11110f",
                foreground: "#e7e4dc",
                cursor: "#f1b24a",
                cursorAccent: "#11110f",
                selectionBackground: "#4f493b",
            },
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(host);
        fit.fit();

        const send = (message: unknown): void => {
            const socket = socketRef.current;
            if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
        };
        let disposed = false;
        let reconnectAttempt = 0;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let terminalClosed = false;
        const clearReconnectTimer = (): void => {
            if (reconnectTimer != null) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };
        const closeCurrentSocket = (): void => {
            const current = socketRef.current;
            if (current == null) return;
            current.onopen = null;
            current.onmessage = null;
            current.onerror = null;
            current.onclose = null;
            current.close();
            socketRef.current = null;
        };
        let connect = (_isRetry = false): void => {};
        const scheduleReconnect = (): void => {
            if (disposed || terminalClosed) return;
            clearReconnectTimer();
            if (reconnectAttempt >= MaxLoomReconnectAttempts) {
                setState("closed");
                return;
            }
            setState("connecting");
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                reconnectAttempt += 1;
                connect(true);
            }, loomReconnectDelayMs(reconnectAttempt));
        };
        connect = (isRetry = false): void => {
            clearReconnectTimer();
            closeCurrentSocket();
            if (!isRetry) reconnectAttempt = 0;
            terminalClosed = false;
            setState("connecting");
            const url = new URL(`${toWebSocketUrl(getRecoderBackendUrl())}/terminal`);
            url.searchParams.set("workspaceId", workspaceId);
            url.searchParams.set("cols", String(terminal.cols));
            url.searchParams.set("rows", String(terminal.rows));
            const socket = new WebSocket(url);
            socketRef.current = socket;
            socket.onopen = () => {
                if (socketRef.current !== socket) return;
                reconnectAttempt = 0;
                setState("connected");
                send({ type: "terminal.resize", cols: terminal.cols, rows: terminal.rows });
                terminal.focus();
            };
            socket.onmessage = (event) => {
                if (socketRef.current !== socket) return;
                let frame: Record<string, unknown>;
                try {
                    frame = JSON.parse(String(event.data)) as Record<string, unknown>;
                } catch {
                    setState("error");
                    return;
                }
                if (frame.type === "terminal.frame" && typeof frame.bytes === "string") {
                    const bytes = decodeBase64(frame.bytes);
                    if (bytes != null) terminal.write(bytes);
                } else if (frame.type === "terminal.error") {
                    terminal.writeln(`\r\n\x1b[31mRecoder: ${String(frame.message ?? "terminal error")}\x1b[0m`);
                    setState("error");
                } else if (frame.type === "terminal.closed") {
                    terminalClosed = true;
                    setState("closed");
                }
            };
            socket.onerror = () => {
                if (socketRef.current === socket) setState("error");
            };
            socket.onclose = () => {
                if (socketRef.current !== socket) return;
                socketRef.current = null;
                scheduleReconnect();
            };
        };
        connectRef.current = () => connect(false);

        const input = terminal.onData((data) => send({ type: "terminal.input", data }));
        const resize = terminal.onResize(({ cols, rows }) => send({ type: "terminal.resize", cols, rows }));
        const resizeObserver = new ResizeObserver(() => fit.fit());
        resizeObserver.observe(host);
        const wheel = (event: WheelEvent): void => {
            if (event.deltaY == 0) return;
            send({ type: "terminal.scroll", direction: event.deltaY < 0 ? "up" : "down", lines: 3 });
        };
        host.addEventListener("wheel", wheel, { passive: true });
        connect();
        const unsubscribeBackendUrl = subscribeRecoderBackendUrl(() => connect(false));

        return () => {
            disposed = true;
            connectRef.current = () => {};
            unsubscribeBackendUrl();
            clearReconnectTimer();
            closeCurrentSocket();
            host.removeEventListener("wheel", wheel);
            resizeObserver.disconnect();
            input.dispose();
            resize.dispose();
            terminal.dispose();
        };
    }, [workspaceId]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#11110f] text-[#e7e4dc]">
            <div className="flex h-9 shrink-0 items-center gap-3 border-b border-[#2c2b27] px-3 text-xs">
                <span className="font-semibold tracking-wide">Workspace terminal</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[#8f8b82]">{workspaceId}</span>
                <span className={state == "connected" ? "text-[#f1b24a]" : "text-[#8f8b82]"}>{state}</span>
                {state != "connected" && (
                    <button className="text-[#e7e4dc] hover:text-[#f1b24a]" onClick={() => connectRef.current()}>
                        Reconnect
                    </button>
                )}
            </div>
            <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden p-2" />
        </div>
    );
}

RecoderLoomTerminalView.displayName = "RecoderLoomTerminalView";

export { loomReconnectDelayMs, RecoderLoomTerminalView };
