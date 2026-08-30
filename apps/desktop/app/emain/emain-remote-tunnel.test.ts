// Copyright 2026, Recoder
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: childProcessMocks.spawn }));

import { RemoteTunnelController } from "./emain-remote-tunnel";

class FakeChild extends EventEmitter {
    stdout = new PassThrough();
    stderr = new PassThrough();
    exitCode: number | null = null;
    signals: string[] = [];

    kill(signal = "SIGTERM") {
        this.signals.push(signal);
        this.exitCode = 0;
        queueMicrotask(() => this.emit("exit", 0, signal));
        return true;
    }
}

describe("RemoteTunnelController", () => {
    let userDataDir: string;
    const children: FakeChild[] = [];

    beforeEach(() => {
        userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "recoder-remote-tunnel-"));
        childProcessMocks.spawn.mockReset().mockImplementation(() => {
            const child = new FakeChild();
            children.push(child);
            return child;
        });
        children.length = 0;
    });

    afterEach(() => fs.rmSync(userDataDir, { recursive: true, force: true }));

    it("follows a reassigned backend port with the same provisioned named tunnel", async () => {
        const tunnelDir = path.join(userDataDir, "remote-tunnel");
        fs.mkdirSync(tunnelDir, { recursive: true });
        fs.writeFileSync(path.join(tunnelDir, "token"), "fixture-token", { mode: 0o600 });
        fs.writeFileSync(
            path.join(tunnelDir, "provision.json"),
            JSON.stringify({
                mode: "named",
                publicUrl: "https://mac-1.remote.recoder.xyz",
                tokenFile: "token",
            })
        );
        const statuses: string[] = [];
        const controller = new RemoteTunnelController({
            isPackaged: true,
            resourcesPath: "/Applications/Recoder.app/Contents/Resources",
            userDataDir,
            env: { PATH: "/usr/bin" },
            onStatus: (status) => statuses.push(`${status.phase}:${status.backendUrl}`),
        });

        await controller.start("http://127.0.0.1:3100");
        expect(childProcessMocks.spawn.mock.calls[0][1]).toContain("http://127.0.0.1:3100");
        expect(childProcessMocks.spawn.mock.calls[0][2].env).toMatchObject({
            TUNNEL_TOKEN_FILE: path.join(tunnelDir, "token"),
        });
        expect(childProcessMocks.spawn.mock.calls[0][2].env).not.toHaveProperty("RECODER_REMOTE_PUBLIC_URL");
        children[0].stderr.write("Registered tunnel connection");
        expect(controller.getStatus()).toMatchObject({
            phase: "ready",
            publicUrl: "https://mac-1.remote.recoder.xyz",
        });

        await controller.start("http://127.0.0.1:45679");
        expect(children[0].signals).toContain("SIGTERM");
        expect(childProcessMocks.spawn.mock.calls[1][1]).toContain("http://127.0.0.1:45679");
        expect(statuses).toContain("starting:http://127.0.0.1:45679");
        await controller.stop();
    });

    it("rejects quick tunnels in a packaged app", async () => {
        const controller = new RemoteTunnelController({
            isPackaged: true,
            resourcesPath: "/Applications/Recoder.app/Contents/Resources",
            userDataDir,
            env: { RECODER_REMOTE_TUNNEL_MODE: "quick" },
        });
        await controller.start("http://127.0.0.1:3100");
        expect(controller.getStatus()).toMatchObject({ phase: "failed", mode: "quick" });
        expect(childProcessMocks.spawn).not.toHaveBeenCalled();
    });

    it("rejects a named tunnel outside the Recoder-owned hostname", async () => {
        const controller = new RemoteTunnelController({
            isPackaged: true,
            resourcesPath: "/Applications/Recoder.app/Contents/Resources",
            userDataDir,
            env: {
                RECODER_REMOTE_TUNNEL_MODE: "named",
                RECODER_REMOTE_PUBLIC_URL: "https://attacker.example",
                TUNNEL_TOKEN: "fixture-token",
            },
        });
        await controller.start("http://127.0.0.1:3100");
        expect(controller.getStatus()).toMatchObject({ phase: "failed", mode: "named" });
        expect(childProcessMocks.spawn).not.toHaveBeenCalled();
    });
});
