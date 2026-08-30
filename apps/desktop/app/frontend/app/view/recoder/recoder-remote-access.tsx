// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";
import { useEffect, useState } from "react";
import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readFetchError } from "./recoder-errors";
import { INPUT, PRIMARY_BTN, QUIET_BTN_XS, SECTION_TITLE } from "./recoder-styles";

type RemoteSession = {
    sessionId: string;
    principalId: string;
    scope: { workspaceIds?: string[]; taskGroup?: string };
    capabilities: ("monitor" | "steer")[];
    issuedAt: string;
    expiresAt: string;
    durable?: boolean;
};

type RemoteSnapshot = {
    total: number;
    degraded: boolean;
    reason?: string;
};

function parseSession(value: unknown): RemoteSession | null {
    if (value == null || typeof value != "object") return null;
    const session = value as Partial<RemoteSession>;
    if (
        typeof session.sessionId != "string" ||
        typeof session.principalId != "string" ||
        typeof session.issuedAt != "string" ||
        typeof session.expiresAt != "string" ||
        session.scope == null ||
        !Array.isArray(session.capabilities)
    ) {
        return null;
    }
    const capabilities = session.capabilities.filter(
        (capability): capability is "monitor" | "steer" => capability == "monitor" || capability == "steer"
    );
    return { ...session, capabilities } as RemoteSession;
}

async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText == null) return false;
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function expiresLabel(expiresAt: string): string {
    const value = Date.parse(expiresAt);
    if (!Number.isFinite(value)) return expiresAt;
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function cleanBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/, "");
}

function isLoopbackUrl(value: string): boolean {
    try {
        const host = new URL(cleanBaseUrl(value)).hostname.toLowerCase();
        return host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "[::1]";
    } catch {
        return false;
    }
}

function receiverUrlFor(receiverBase: string, sessionId: string, accessBase: string): string {
    const receiver = `${cleanBaseUrl(receiverBase)}/${encodeURIComponent(sessionId)}`;
    const api = cleanBaseUrl(accessBase);
    if (!api || isLoopbackUrl(api)) return receiver;
    return `${receiver}?api=${encodeURIComponent(api)}`;
}

function RecoderRemoteAccess({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
    const [includeSteer, setIncludeSteer] = useState(false);
    const [creating, setCreating] = useState(false);
    const [session, setSession] = useState<RemoteSession | null>(null);
    const [snapshot, setSnapshot] = useState<RemoteSnapshot | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState("");
    const initialRemoteStatus = getApi()?.getRecoderRemoteStatus?.();
    const [remoteStatus, setRemoteStatus] = useState<RecoderRemoteTunnelStatus>(
        initialRemoteStatus ?? { phase: "disabled", mode: "off", backendUrl: null, publicUrl: null }
    );
    const [accessBase, setAccessBase] = useState(initialRemoteStatus?.publicUrl ?? getRecoderBackendUrl());
    const [receiverBase, setReceiverBase] = useState("https://recoder.xyz/remote");

    useEffect(() => {
        setSession(null);
        setSnapshot(null);
        setError("");
        setCopied("");
    }, [workspaceId]);

    useEffect(() => {
        getApi()?.onRecoderRemoteStatus?.((status) => {
            setRemoteStatus(status);
            if (status.phase == "ready" && status.publicUrl) setAccessBase(status.publicUrl);
        });
    }, []);

    const refreshSnapshot = async (active: RemoteSession) => {
        setRefreshing(true);
        setError("");
        try {
            const url = `${getRecoderBackendUrl()}/api/conductor/remote/sessions/${encodeURIComponent(active.sessionId)}/snapshot`;
            const res = await fetch(url);
            if (!res.ok) {
                const reason = await readFetchError(res);
                throw new Error(reason || `Remote status unavailable (${res.status})`);
            }
            const value = (await res.json())?.data?.snapshot;
            if (value == null || typeof value != "object" || typeof value.total != "number") {
                throw new Error("Remote status response was incomplete");
            }
            setSnapshot({
                total: value.total,
                degraded: value.degraded === true,
                ...(typeof value.reason == "string" ? { reason: value.reason } : {}),
            });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setRefreshing(false);
        }
    };

    const createSession = async () => {
        if (creating) return;
        setCreating(true);
        setError("");
        setCopied("");
        setSnapshot(null);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/remote/sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceIds: [workspaceId],
                    capabilities: includeSteer ? ["monitor", "steer"] : ["monitor"],
                }),
            });
            if (!res.ok) {
                const reason = await readFetchError(res);
                throw new Error(reason || `Could not create remote access (${res.status})`);
            }
            const active = parseSession((await res.json())?.data?.session);
            if (active == null) throw new Error("Remote session response was incomplete");
            setSession(active);
            void refreshSnapshot(active);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setCreating(false);
        }
    };

    const copyAccess = async () => {
        if (session == null) return;
        const base = cleanBaseUrl(accessBase);
        const receiver = cleanBaseUrl(receiverBase);
        if (base == "") {
            setCopied("Enter a reachable API URL first");
            return;
        }
        if (receiver == "") {
            setCopied("Enter the receiver app URL first");
            return;
        }
        const receiverUrl = receiverUrlFor(receiver, session.sessionId, base);
        const packet = JSON.stringify(
            {
                receiver: receiverUrl,
                api: base,
                sessionId: session.sessionId,
                workspaceId,
                capabilities: session.capabilities,
                expiresAt: session.expiresAt,
                snapshot: `${base}/api/conductor/remote/sessions/${encodeURIComponent(session.sessionId)}/snapshot`,
                steer: `${base}/api/conductor/remote/sessions/${encodeURIComponent(session.sessionId)}/workspaces/${encodeURIComponent(workspaceId)}/steer`,
            },
            null,
            2
        );
        setCopied((await copyText(packet)) ? "Access details copied" : "Clipboard unavailable");
    };

    const copyReceiverLink = async () => {
        if (session == null) return;
        const receiver = cleanBaseUrl(receiverBase);
        if (receiver == "") {
            setCopied("Enter the receiver app URL first");
            return;
        }
        const url = receiverUrlFor(receiver, session.sessionId, accessBase);
        setCopied((await copyText(url)) ? "Receiver link copied" : "Clipboard unavailable");
    };

    const endSession = async () => {
        if (session == null) return;
        setError("");
        try {
            const url = `${getRecoderBackendUrl()}/api/conductor/remote/sessions/${encodeURIComponent(session.sessionId)}`;
            const res = await fetch(url, { method: "DELETE" });
            if (!res.ok) {
                const reason = await readFetchError(res);
                throw new Error(reason || `Could not end remote session (${res.status})`);
            }
            setSession(null);
            setSnapshot(null);
            setCopied("");
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        }
    };

    return (
        <section className="shrink-0 border-b border-border bg-panel/20" aria-label="Remote workspace access">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                    <div className={SECTION_TITLE}>Remote access</div>
                    <div className="text-xs text-meta">
                        Continue this workspace from another signed-in Recoder client
                    </div>
                </div>
                <button className={QUIET_BTN_XS} onClick={onClose} aria-label="Close remote access">
                    Close
                </button>
            </div>
            <div className="border-t border-white/[0.05] px-3 py-3">
                <label className="mb-3 flex max-w-xl flex-col gap-1 text-xs text-secondary">
                    <span>Reachable API URL for the other client</span>
                    <input
                        type="url"
                        value={accessBase}
                        onChange={(event) => setAccessBase(event.target.value)}
                        className={INPUT}
                        placeholder="https://your-recoder-host.example"
                    />
                    {isLoopbackUrl(accessBase) && (
                        <span className="text-meta">
                            Loopback works only on this computer. Enter the same backend&apos;s reachable URL before
                            copying for another device.
                        </span>
                    )}
                    {remoteStatus.phase == "starting" && (
                        <span className="text-meta">Provisioned tunnel is connecting to this desktop…</span>
                    )}
                    {remoteStatus.phase == "ready" && remoteStatus.publicUrl && (
                        <span className="text-accent">Connected through {remoteStatus.publicUrl}</span>
                    )}
                    {remoteStatus.phase == "failed" && (
                        <span className="text-error">
                            Tunnel unavailable — {remoteStatus.reason || "connector exited"}
                        </span>
                    )}
                </label>
                <label className="mb-3 flex max-w-xl flex-col gap-1 text-xs text-secondary">
                    <span>Signed-in receiver app URL</span>
                    <input
                        type="url"
                        value={receiverBase}
                        onChange={(event) => setReceiverBase(event.target.value)}
                        className={INPUT}
                        placeholder="https://recoder.xyz/remote"
                    />
                </label>
                {session == null ? (
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-secondary">
                            <input
                                type="checkbox"
                                checked={includeSteer}
                                onChange={(event) => setIncludeSteer(event.target.checked)}
                                className="accent-accent"
                            />
                            Allow governed remote input
                        </label>
                        <button className={PRIMARY_BTN} onClick={() => void createSession()} disabled={creating}>
                            {creating ? "Creating…" : "Create remote session"}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="font-medium text-primary">
                                Active until {expiresLabel(session.expiresAt)}
                            </span>
                            <span className="text-secondary">{session.capabilities.join(" · ")}</span>
                            <span className={session.durable ? "text-accent" : "text-secondary"}>
                                {session.durable ? "restart-survivable" : "available while this backend is running"}
                            </span>
                        </div>
                        <code className="select-all break-all rounded bg-black/20 px-2 py-1 text-[11px] text-secondary">
                            {session.sessionId}
                        </code>
                        <div className="flex flex-wrap items-center gap-2">
                            <button className={QUIET_BTN_XS} onClick={() => void copyReceiverLink()}>
                                Copy receiver link
                            </button>
                            <button className={QUIET_BTN_XS} onClick={() => void copyAccess()}>
                                Copy access details
                            </button>
                            <button
                                className={QUIET_BTN_XS}
                                onClick={() => void refreshSnapshot(session)}
                                disabled={refreshing}
                            >
                                {refreshing ? "Refreshing…" : "Refresh status"}
                            </button>
                            <button className={QUIET_BTN_XS} onClick={() => void endSession()}>
                                End session
                            </button>
                            {copied != "" && <span className="text-xs text-secondary">{copied}</span>}
                        </div>
                        {snapshot != null && (
                            <div className="text-xs text-secondary">
                                {snapshot.total} live pane{snapshot.total == 1 ? "" : "s"} in scope
                                {snapshot.degraded
                                    ? ` · degraded${snapshot.reason ? ` — ${snapshot.reason}` : ""}`
                                    : ""}
                            </div>
                        )}
                    </div>
                )}
                {error != "" && <div className="mt-2 text-xs text-error">{error}</div>}
                <div className="mt-2 text-[11px] text-meta">
                    The session id limits scope but does not bypass sign-in, ownership checks, policy, approvals, or
                    audit.
                </div>
            </div>
        </section>
    );
}

RecoderRemoteAccess.displayName = "RecoderRemoteAccess";

export { RecoderRemoteAccess };
