// Copyright 2026, Recoder
// SPDX-License-Identifier: Apache-2.0

import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type RemoteLoomProvision = {
    mode?: "ziti";
    service?: string;
    identityFile?: string;
};

type RemoteLoomOptions = {
    isPackaged: boolean;
    resourcesPath: string;
    repoRoot: string;
    userDataDir: string;
    log?: (level: "info" | "warn", message: string) => void;
};

const SERVICE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class RemoteLoomController {
    private readonly options: RemoteLoomOptions;
    private child: ChildProcessWithoutNullStreams | null = null;

    constructor(options: RemoteLoomOptions) {
        this.options = options;
    }

    /** Start the provisioned dial bridge and return its private socket path. */
    start(): string | null {
        if (this.child != null) return this.socketPath();
        const provision = this.readProvision();
        if (provision?.mode !== "ziti") return null;
        const service = provision.service?.trim();
        if (!service || !SERVICE_PATTERN.test(service)) {
            this.options.log?.("warn", "Remote Loom provision has an invalid service name.");
            return null;
        }
        const identityPath = this.resolveIdentity(provision.identityFile);
        if (identityPath == null || !fs.existsSync(identityPath)) {
            this.options.log?.("warn", "Remote Loom provisioned identity is missing.");
            return null;
        }
        const script = this.options.isPackaged
            ? path.join(this.options.resourcesPath, "backend", "scripts", "loom-ziti-bridge.mjs")
            : path.join(this.options.repoRoot, "scripts", "loom-ziti-bridge.mjs");
        const ziti = this.options.isPackaged
            ? path.join(this.options.resourcesPath, "backend", "engines", "ziti", "ziti")
            : path.join(this.options.repoRoot, "apps", "desktop", "server", "engines", "ziti", "bin", "ziti");
        if (!fs.existsSync(script) || !fs.existsSync(ziti)) {
            this.options.log?.("warn", "Remote Loom bridge assets are missing from this build.");
            return null;
        }

        const socketPath = this.socketPath();
        const child = spawn(
            process.execPath,
            [
                script,
                "dial",
                "--identity",
                identityPath,
                "--service",
                service,
                "--socket",
                socketPath,
                "--ziti-bin",
                ziti,
            ],
            {
                env: {
                    PATH: process.env.PATH,
                    HOME: process.env.HOME,
                    TMPDIR: process.env.TMPDIR,
                    ELECTRON_RUN_AS_NODE: "1",
                },
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
            }
        );
        this.child = child;
        child.stdout.on("data", (chunk) => this.options.log?.("info", chunk.toString("utf8").trim()));
        child.stderr.on("data", (chunk) => this.options.log?.("warn", chunk.toString("utf8").trim()));
        child.once("error", (error) => {
            if (this.child === child) this.child = null;
            this.options.log?.("warn", `Remote Loom bridge failed: ${error.message}`);
        });
        child.once("exit", (code, signal) => {
            if (this.child === child) this.child = null;
            this.options.log?.("warn", `Remote Loom bridge exited (${signal ?? code ?? "unknown"}).`);
        });
        this.options.log?.("info", `Starting OpenZiti Loom bridge for service ${service}.`);
        return socketPath;
    }

    async stop(): Promise<void> {
        const child = this.child;
        this.child = null;
        if (child == null || child.exitCode != null) return;
        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                child.kill("SIGKILL");
                resolve();
            }, 2_000);
            child.once("exit", () => {
                clearTimeout(timer);
                resolve();
            });
            child.kill("SIGTERM");
        });
    }

    private socketPath(): string {
        return path.join(this.options.userDataDir, "remote-loom", "loom-remote.sock");
    }

    private readProvision(): RemoteLoomProvision | null {
        try {
            const value = JSON.parse(
                fs.readFileSync(path.join(this.options.userDataDir, "remote-loom", "provision.json"), "utf8")
            );
            return value && typeof value === "object" ? (value as RemoteLoomProvision) : null;
        } catch {
            return null;
        }
    }

    private resolveIdentity(value: string | undefined): string | null {
        if (!value?.trim()) return null;
        const root = path.resolve(this.options.userDataDir, "remote-loom");
        const candidate = path.resolve(root, value.trim());
        return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
    }
}
