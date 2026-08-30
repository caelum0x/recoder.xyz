// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", () => ({
    createBlock: vi.fn().mockResolvedValue("block-1"),
}));

import { createBlock } from "@/app/store/global";
import {
    buildAttachBlockMeta,
    handleOpenWorkspaceTerminalIpc,
    isTrustedCockpitOrigin,
    openWorkspaceTerminal,
    parseOpenWorkspaceTerminalPayload,
    resolveConductorTmuxBin,
    resolveConductorTmuxServer,
    sanitizeTmuxSocket,
} from "./recoder-open-terminal";

const createBlockMock = vi.mocked(createBlock);

function mockHealthFetch(tmuxBin: unknown, tmuxSocket?: unknown) {
    return vi.fn().mockResolvedValue({
        json: async () => ({ data: { substrate: { tmuxBin, tmuxSocket } } }),
    });
}

describe("parseOpenWorkspaceTerminalPayload", () => {
    it("accepts a conductor-shaped session name", () => {
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "conductor-abc_123" })).toEqual({
            sessionName: "conductor-abc_123",
        });
    });

    it("keeps a plausible cwd", () => {
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "s1", cwd: "/tmp/worktrees/s1" })).toEqual({
            sessionName: "s1",
            cwd: "/tmp/worktrees/s1",
        });
    });

    it("drops a flag-shaped or empty cwd but keeps the request", () => {
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "s1", cwd: "-t evil" })).toEqual({
            sessionName: "s1",
        });
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "s1", cwd: "" })).toEqual({ sessionName: "s1" });
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "s1", cwd: 42 })).toEqual({ sessionName: "s1" });
    });

    it("rejects non-objects and missing/invalid session names", () => {
        expect(parseOpenWorkspaceTerminalPayload(null)).toBeNull();
        expect(parseOpenWorkspaceTerminalPayload("s1")).toBeNull();
        expect(parseOpenWorkspaceTerminalPayload({})).toBeNull();
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "" })).toBeNull();
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "-t bad" })).toBeNull();
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "has space" })).toBeNull();
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "a:b" })).toBeNull();
        expect(parseOpenWorkspaceTerminalPayload({ sessionName: "x".repeat(200) })).toBeNull();
    });
});

describe("buildAttachBlockMeta", () => {
    it("builds a term/cmd block that re-attaches on restart", () => {
        const meta = buildAttachBlockMeta({ sessionName: "conductor-s1", cwd: "/wt/s1" }, "/pin/tmux");
        expect(meta).toEqual({
            view: "term",
            controller: "cmd",
            cmd: "/pin/tmux",
            "cmd:args": ["attach-session", "-t", "conductor-s1"],
            "cmd:shell": false,
            "cmd:runonstart": true,
            "cmd:runonce": false,
            "cmd:clearonstart": true,
            "cmd:cwd": "/wt/s1",
        });
    });

    it("omits cmd:cwd when the payload has none", () => {
        const meta = buildAttachBlockMeta({ sessionName: "s1" }, "tmux");
        expect(meta).not.toHaveProperty("cmd:cwd");
    });

    it("prepends -S <socket> as a global flag so attach hits the conductor's server", () => {
        const meta = buildAttachBlockMeta({ sessionName: "conductor-s1" }, "/pin/tmux", "/tmp/tmux-501/default");
        expect(meta["cmd:args"]).toEqual(["-S", "/tmp/tmux-501/default", "attach-session", "-t", "conductor-s1"]);
    });

    it("omits -S when the socket is unknown (falls back to tmux's default server)", () => {
        const meta = buildAttachBlockMeta({ sessionName: "s1" }, "/pin/tmux");
        expect(meta["cmd:args"]).toEqual(["attach-session", "-t", "s1"]);
    });
});

describe("sanitizeTmuxSocket", () => {
    it("keeps a plausible absolute socket path", () => {
        expect(sanitizeTmuxSocket("/tmp/tmux-501/default")).toBe("/tmp/tmux-501/default");
    });

    it("drops empty, flag-shaped, null-byte, and non-string sockets", () => {
        expect(sanitizeTmuxSocket("")).toBeUndefined();
        expect(sanitizeTmuxSocket("  ")).toBeUndefined();
        expect(sanitizeTmuxSocket("-L evil")).toBeUndefined();
        expect(sanitizeTmuxSocket("/tmp/a\0b")).toBeUndefined();
        expect(sanitizeTmuxSocket(42)).toBeUndefined();
        expect(sanitizeTmuxSocket(null)).toBeUndefined();
    });
});

describe("resolveConductorTmuxServer", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sources the pinned binary AND default socket from conductor health", async () => {
        vi.stubGlobal("fetch", mockHealthFetch("/engines/tmux/bin/tmux", "/tmp/tmux-501/default"));
        await expect(resolveConductorTmuxServer()).resolves.toEqual({
            tmuxBin: "/engines/tmux/bin/tmux",
            tmuxSocket: "/tmp/tmux-501/default",
        });
    });

    it("omits the socket when health reports it unknown (null)", async () => {
        vi.stubGlobal("fetch", mockHealthFetch("/pin/tmux", null));
        await expect(resolveConductorTmuxServer()).resolves.toEqual({ tmuxBin: "/pin/tmux" });
    });

    it("falls back to PATH tmux with no socket when the backend is unreachable", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
        await expect(resolveConductorTmuxServer()).resolves.toEqual({ tmuxBin: "tmux" });
    });
});

describe("resolveConductorTmuxBin", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", mockHealthFetch("/engines/tmux/bin/tmux"));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("uses the conductor-pinned tmux from /api/conductor/health", async () => {
        await expect(resolveConductorTmuxBin()).resolves.toBe("/engines/tmux/bin/tmux");
    });

    it("falls back to PATH tmux when the backend is unreachable", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
        await expect(resolveConductorTmuxBin()).resolves.toBe("tmux");
    });

    it("falls back to PATH tmux when the payload has no tmuxBin", async () => {
        vi.stubGlobal("fetch", mockHealthFetch(""));
        await expect(resolveConductorTmuxBin()).resolves.toBe("tmux");
    });
});

describe("openWorkspaceTerminal", () => {
    beforeEach(() => {
        createBlockMock.mockClear();
        vi.stubGlobal("fetch", mockHealthFetch("/pin/tmux"));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("creates the block with a caller-provided (trusted) tmuxBin", async () => {
        await openWorkspaceTerminal({ sessionName: "s1", cwd: "/wt/s1" }, "/custom/tmux");
        expect(createBlockMock).toHaveBeenCalledWith({
            meta: expect.objectContaining({ cmd: "/custom/tmux", "cmd:args": ["attach-session", "-t", "s1"] }),
        });
    });

    it("resolves tmuxBin from the backend when the caller has none", async () => {
        await openWorkspaceTerminal({ sessionName: "s1" });
        expect(createBlockMock).toHaveBeenCalledWith({
            meta: expect.objectContaining({ cmd: "/pin/tmux" }),
        });
    });

    it("opens the bounded Loom terminal for a Loom workspace instead of attaching tmux", async () => {
        await openWorkspaceTerminal({
            sessionName: "pane-1",
            cwd: "/wt/s1",
            workspaceId: "ws-1",
            substrate: "loom",
        });
        expect(createBlockMock).toHaveBeenCalledWith({
            meta: { view: "recoder-loom-terminal", "recoder:workspaceid": "ws-1" },
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("refuses a Loom terminal open without a durable workspace id", async () => {
        await openWorkspaceTerminal({ sessionName: "pane-1", substrate: "loom" });
        expect(createBlockMock).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("attaches on the conductor's socket when health reports one (no caller bin)", async () => {
        vi.stubGlobal("fetch", mockHealthFetch("/pin/tmux", "/tmp/tmux-501/default"));
        await openWorkspaceTerminal({ sessionName: "conductor-s1" });
        expect(createBlockMock).toHaveBeenCalledWith({
            meta: expect.objectContaining({
                cmd: "/pin/tmux",
                "cmd:args": ["-S", "/tmp/tmux-501/default", "attach-session", "-t", "conductor-s1"],
            }),
        });
    });

    it("ignores the socket for a caller-provided (trusted) bin — hub path unchanged", async () => {
        vi.stubGlobal("fetch", mockHealthFetch("/pin/tmux", "/tmp/tmux-501/default"));
        await openWorkspaceTerminal({ sessionName: "s1" }, "/custom/tmux");
        expect(createBlockMock).toHaveBeenCalledWith({
            meta: expect.objectContaining({ cmd: "/custom/tmux", "cmd:args": ["attach-session", "-t", "s1"] }),
        });
    });

    it("swallows createBlock failures (degrade-safe)", async () => {
        createBlockMock.mockRejectedValueOnce(new Error("rpc down"));
        await expect(openWorkspaceTerminal({ sessionName: "s1" }, "tmux")).resolves.toBeUndefined();
    });
});

describe("isTrustedCockpitOrigin", () => {
    afterEach(() => {
        delete (globalThis as { __RECODER_BACKEND_URL__?: unknown }).__RECODER_BACKEND_URL__;
    });

    it("trusts the backend origin (default 127.0.0.1:3100) incl localhost equivalence", () => {
        expect(isTrustedCockpitOrigin("http://127.0.0.1:3100/cockpit/index.html")).toBe(true);
        expect(isTrustedCockpitOrigin("http://localhost:3100/cockpit/")).toBe(true);
    });

    it("rejects other ports, hosts, protocols, and garbage", () => {
        expect(isTrustedCockpitOrigin("http://127.0.0.1:9999/")).toBe(false);
        expect(isTrustedCockpitOrigin("https://127.0.0.1:3100/")).toBe(false);
        expect(isTrustedCockpitOrigin("http://evil.example.com:3100/")).toBe(false);
        expect(isTrustedCockpitOrigin("not-a-url")).toBe(false);
        expect(isTrustedCockpitOrigin("")).toBe(false);
    });

    it("follows a configured backend URL override", () => {
        (globalThis as { __RECODER_BACKEND_URL__?: unknown }).__RECODER_BACKEND_URL__ = "http://127.0.0.1:4242";
        expect(isTrustedCockpitOrigin("http://localhost:4242/cockpit/")).toBe(true);
        expect(isTrustedCockpitOrigin("http://127.0.0.1:3100/cockpit/")).toBe(false);
    });
});

describe("handleOpenWorkspaceTerminalIpc", () => {
    beforeEach(() => {
        createBlockMock.mockClear();
        vi.stubGlobal("fetch", mockHealthFetch("/pin/tmux"));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("opens a terminal block for a trusted guest with a valid payload", async () => {
        const acted = await handleOpenWorkspaceTerminalIpc("http://127.0.0.1:3100/cockpit/", {
            sessionName: "conductor-s1",
            cwd: "/wt/s1",
        });
        expect(acted).toBe(true);
        expect(createBlockMock).toHaveBeenCalledOnce();
    });

    it("refuses untrusted guest origins without touching createBlock", async () => {
        const acted = await handleOpenWorkspaceTerminalIpc("https://evil.example.com/", { sessionName: "s1" });
        expect(acted).toBe(false);
        expect(createBlockMock).not.toHaveBeenCalled();
    });

    it("refuses invalid payloads from trusted origins", async () => {
        const acted = await handleOpenWorkspaceTerminalIpc("http://127.0.0.1:3100/", { sessionName: "-t bad" });
        expect(acted).toBe(false);
        expect(createBlockMock).not.toHaveBeenCalled();
    });
});
