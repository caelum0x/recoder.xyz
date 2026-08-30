// Copyright 2026, Recoder
// SPDX-License-Identifier: Apache-2.0

import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type RemoteTunnelPhase = "disabled" | "starting" | "ready" | "failed" | "stopped";

export type RemoteTunnelStatus = {
    phase: RemoteTunnelPhase;
    mode: "off" | "named" | "quick";
    backendUrl: string | null;
    publicUrl: string | null;
    reason?: string;
};

type RemoteTunnelOptions = {
    isPackaged: boolean;
    resourcesPath: string;
    userDataDir: string;
    env?: NodeJS.ProcessEnv;
    log?: (level: "info" | "warn", message: string) => void;
    onStatus?: (status: RemoteTunnelStatus) => void;
};

const RECODER_REMOTE_HOST_SUFFIX = ".remote.recoder.xyz";
const QUICK_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i;
const READY_PATTERN = /registered tunnel connection|connection .* registered/i;

function cleanOrigin(value: string | undefined): string | null {
    if (!value?.trim()) return null;
    try {
        const url = new URL(value.trim());
        if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash ||
            !url.hostname.toLowerCase().endsWith(RECODER_REMOTE_HOST_SUFFIX)
        ) {
            return null;
        }
        return url.origin;
    } catch {
        return null;
    }
}

type TunnelProvision = { mode?: "named"; publicUrl?: string; tokenFile?: string };

function readProvision(userDataDir: string): TunnelProvision {
    const provisionPath = path.join(userDataDir, "remote-tunnel", "provision.json");
    try {
        const parsed = JSON.parse(fs.readFileSync(provisionPath, "utf8")) as TunnelProvision;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function resolveMode(env: NodeJS.ProcessEnv, provision: TunnelProvision): "off" | "named" | "quick" {
    const configured = env.RECODER_REMOTE_TUNNEL_MODE?.trim().toLowerCase();
    if (configured === "named" || configured === "quick") return configured;
    if (provision.mode === "named") return "named";
    return "off";
}

export function resolveCloudflaredBin(
    options: Pick<RemoteTunnelOptions, "isPackaged" | "resourcesPath" | "env">
): string {
    const env = options.env ?? process.env;
    if (env.RECODER_CLOUDFLARED_BIN?.trim()) return env.RECODER_CLOUDFLARED_BIN.trim();
    if (options.isPackaged) {
        return path.join(options.resourcesPath, "backend", "engines", "cloudflared", "cloudflared");
    }
    const candidates = [
        "/opt/homebrew/bin/cloudflared",
        "/usr/local/bin/cloudflared",
        path.join(os.homedir(), ".local", "bin", "cloudflared"),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? "cloudflared";
}

function connectorEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const result: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "HOME", "TMPDIR", "SSL_CERT_FILE", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"]) {
        if (source[key]) result[key] = source[key];
    }
    const token = source.RECODER_CLOUDFLARE_TUNNEL_TOKEN || source.TUNNEL_TOKEN;
    const tokenFile = source.RECODER_CLOUDFLARE_TUNNEL_TOKEN_FILE || source.TUNNEL_TOKEN_FILE;
    if (token) result.TUNNEL_TOKEN = token;
    if (tokenFile) result.TUNNEL_TOKEN_FILE = tokenFile;
    return result;
}

export class RemoteTunnelController {
    private readonly options: RemoteTunnelOptions;
    private child: ChildProcessWithoutNullStreams | null = null;
    private desiredBackendUrl: string | null = null;
    private restartTimer: NodeJS.Timeout | null = null;
    private restartCount = 0;
    private generation = 0;
    private status: RemoteTunnelStatus = {
        phase: "disabled",
        mode: "off",
        backendUrl: null,
        publicUrl: null,
    };

    constructor(options: RemoteTunnelOptions) {
        this.options = options;
    }

    getStatus(): RemoteTunnelStatus {
        return { ...this.status };
    }

    async start(backendUrl: string): Promise<RemoteTunnelStatus> {
        this.desiredBackendUrl = backendUrl;
        this.generation++;
        const generation = this.generation;
        this.clearRestart();
        await this.terminateChild();
        if (generation !== this.generation) return this.getStatus();
        this.launch(backendUrl, generation);
        return this.getStatus();
    }

    async stop(): Promise<void> {
        this.desiredBackendUrl = null;
        this.generation++;
        this.clearRestart();
        await this.terminateChild();
        this.update({ phase: "stopped", mode: this.status.mode, backendUrl: null, publicUrl: null });
    }

    private launch(backendUrl: string, generation: number): void {
        const env = this.options.env ?? process.env;
        const provision = readProvision(this.options.userDataDir);
        const mode = resolveMode(env, provision);
        if (mode === "off") {
            this.update({ phase: "disabled", mode, backendUrl, publicUrl: null });
            return;
        }
        if (mode === "quick" && this.options.isPackaged) {
            this.update({
                phase: "failed",
                mode,
                backendUrl,
                publicUrl: null,
                reason: "Quick tunnels are development-only; provision a Recoder named tunnel for the installed app.",
            });
            return;
        }

        const publicUrl = mode === "named" ? cleanOrigin(env.RECODER_REMOTE_PUBLIC_URL || provision.publicUrl) : null;
        const childEnv = connectorEnv(env);
        if (!childEnv.TUNNEL_TOKEN && !childEnv.TUNNEL_TOKEN_FILE && provision.tokenFile) {
            childEnv.TUNNEL_TOKEN_FILE = path.isAbsolute(provision.tokenFile)
                ? provision.tokenFile
                : path.join(this.options.userDataDir, "remote-tunnel", provision.tokenFile);
        }
        if (mode === "named" && publicUrl == null) {
            this.update({
                phase: "failed",
                mode,
                backendUrl,
                publicUrl: null,
                reason: "RECODER_REMOTE_PUBLIC_URL must be an HTTPS subdomain of remote.recoder.xyz.",
            });
            return;
        }
        if (mode === "named" && !childEnv.TUNNEL_TOKEN && !childEnv.TUNNEL_TOKEN_FILE) {
            this.update({
                phase: "failed",
                mode,
                backendUrl,
                publicUrl,
                reason: "A Recoder Cloudflare Tunnel token or token file is required.",
            });
            return;
        }
        if (mode === "named" && childEnv.TUNNEL_TOKEN_FILE && !fs.existsSync(childEnv.TUNNEL_TOKEN_FILE)) {
            this.update({
                phase: "failed",
                mode,
                backendUrl,
                publicUrl,
                reason: "The provisioned Cloudflare Tunnel token file is missing.",
            });
            return;
        }

        const configDir = path.join(this.options.userDataDir, "remote-tunnel");
        const configPath = path.join(configDir, "cloudflared.yml");
        try {
            fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
            fs.writeFileSync(
                configPath,
                "no-autoupdate: true\nmetrics: 127.0.0.1:0\nloglevel: info\ntransport-loglevel: warn\n",
                { mode: 0o600 }
            );
        } catch (error) {
            this.update({
                phase: "failed",
                mode,
                backendUrl,
                publicUrl,
                reason: `Could not prepare the tunnel runtime: ${error instanceof Error ? error.message : String(error)}`,
            });
            return;
        }

        const binary = resolveCloudflaredBin(this.options);
        const args =
            mode === "named"
                ? ["tunnel", "--config", configPath, "run", "--url", backendUrl]
                : ["tunnel", "--config", configPath, "--url", backendUrl];
        this.update({ phase: "starting", mode, backendUrl, publicUrl });
        this.options.log?.("info", `Starting ${mode} remote connector for ${backendUrl}`);

        let child: ChildProcessWithoutNullStreams;
        try {
            child = spawn(binary, args, {
                env: childEnv,
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
            });
        } catch (error) {
            this.failLaunch(mode, backendUrl, publicUrl, error);
            return;
        }
        this.child = child;
        let outputWindow = "";
        const consume = (chunk: Buffer) => {
            if (generation !== this.generation) return;
            outputWindow = `${outputWindow}${chunk.toString("utf8")}`.slice(-8192);
            const quickUrl = mode === "quick" ? (outputWindow.match(QUICK_URL_PATTERN)?.[0] ?? null) : null;
            if (quickUrl || READY_PATTERN.test(outputWindow)) {
                this.restartCount = 0;
                this.update({
                    phase: "ready",
                    mode,
                    backendUrl,
                    publicUrl: quickUrl ?? publicUrl,
                });
            }
        };
        child.stdout.on("data", consume);
        child.stderr.on("data", consume);
        child.once("error", (error) => {
            if (generation !== this.generation) return;
            this.child = null;
            this.failLaunch(mode, backendUrl, publicUrl, error);
            this.scheduleRestart(generation);
        });
        child.once("exit", (code, signal) => {
            if (generation !== this.generation) return;
            this.child = null;
            this.update({
                phase: "failed",
                mode,
                backendUrl,
                publicUrl,
                reason: `Remote connector exited (${signal ?? code ?? "unknown"}).`,
            });
            this.scheduleRestart(generation);
        });
    }

    private failLaunch(mode: "named" | "quick", backendUrl: string, publicUrl: string | null, error: unknown): void {
        const reason = error instanceof Error ? error.message : String(error);
        this.options.log?.("warn", `Remote connector failed: ${reason}`);
        this.update({ phase: "failed", mode, backendUrl, publicUrl, reason });
    }

    private scheduleRestart(generation: number): void {
        if (this.desiredBackendUrl == null || generation !== this.generation || this.restartTimer != null) return;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.restartCount++, 5));
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            if (this.desiredBackendUrl != null && generation === this.generation) {
                this.launch(this.desiredBackendUrl, generation);
            }
        }, delay);
    }

    private clearRestart(): void {
        if (this.restartTimer != null) clearTimeout(this.restartTimer);
        this.restartTimer = null;
    }

    private async terminateChild(): Promise<void> {
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

    private update(status: RemoteTunnelStatus): void {
        this.status = status;
        this.options.onStatus?.(this.getStatus());
    }
}
