// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * emain-backend-core tests — ported from legacy-shell/__tests__/backend-supervisor.test.js.
 *
 * Exercise the supervisor's real logic — port pick, env assembly, tmux
 * resolution, secret persistence, health-poll (success + timeout + early exit),
 * mint, child lifecycle (spawn / crash-restart-with-backoff / stop), and the
 * AI-gateway config writer — using a fake child process, a fake fetch, and an
 * in-memory fs. No Electron runtime, no real backend, no network.
 */

import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
    assembleBackendEnv,
    BackendSupervisor,
    backendUrlForPort,
    backoffMs,
    FsLike,
    gatewayEndpointForPort,
    loadOrCreateSecrets,
    mergePathIntoEnv,
    PHASE,
    pickFreePort,
    pollHealth,
    resolveLoginShellPath,
    resolveTmuxBin,
    writeCockpitWidgetConfig,
    writeWaveAIGatewayConfig,
} from "./emain-backend-core";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function makeStream() {
    const handlers: Record<string, Array<(...args: any[]) => void>> = {};
    return {
        on(event: string, cb: (...args: any[]) => void) {
            handlers[event] = handlers[event] || [];
            handlers[event].push(cb);
            return this;
        },
        emit(event: string, ...args: any[]) {
            (handlers[event] || []).forEach((cb) => cb(...args));
        },
    };
}

function makeFakeChild() {
    const handlers: Record<string, Array<(...args: any[]) => void>> = {};
    const child = {
        pid: 4242,
        killed: false,
        exitCode: null as number,
        _killSignal: null as string,
        stdout: makeStream(),
        stderr: makeStream(),
        on(event: string, cb: (...args: any[]) => void) {
            handlers[event] = handlers[event] || [];
            handlers[event].push(cb);
            return this;
        },
        kill(signal?: string) {
            this.killed = true;
            this._killSignal = signal;
            setTimeout(() => this._emit("exit", null, signal || "SIGTERM"), 0);
            return true;
        },
        _emit(event: string, ...args: any[]) {
            (handlers[event] || []).forEach((cb) => cb(...args));
        },
    };
    return child;
}

function makeMemFs(initial: Record<string, string> = {}) {
    const files = new Map(Object.entries(initial));
    const dirs = new Set<string>();
    return {
        files,
        existsSync: vi.fn((p: string) => files.has(p) || dirs.has(p)),
        readFileSync: vi.fn((p: string) => {
            if (!files.has(p)) {
                throw new Error(`ENOENT: ${p}`);
            }
            return files.get(p);
        }),
        writeFileSync: vi.fn((p: string, data: string) => {
            files.set(p, data);
        }),
        appendFileSync: vi.fn((p: string, data: string) => {
            files.set(p, (files.get(p) || "") + data);
        }),
        mkdirSync: vi.fn((p: string) => {
            dirs.add(p);
        }),
        chmodSync: vi.fn(),
    };
}

const noopSleep = () => Promise.resolve();

function baseOptions(overrides: Record<string, any> = {}) {
    return {
        userDataDir: path.join(os.tmpdir(), "recoder-sb-test-userdata"),
        repoRoot: "/repo",
        isPackaged: false,
        fs: makeMemFs() as unknown as FsLike,
        spawn: vi.fn(() => makeFakeChild()),
        fetchImpl: vi.fn() as any,
        pickFreePort: vi.fn(() => Promise.resolve(45678)),
        // Deterministic: the preferred-port (3100) probe must never touch a
        // real socket in unit tests — force the pickFreePort path.
        portIsFree: vi.fn(() => Promise.resolve(false)),
        mintKey: vi.fn(() => Promise.resolve("sk_test_minted_key")),
        // Never spawn a real interactive login shell in unit tests (~2s each).
        resolveLoginShellPath: () => "",
        sleep: noopSleep,
        healthIntervalMs: 1,
        healthTimeoutMs: 50,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("pickFreePort", () => {
    it("resolves a usable loopback port number", async () => {
        const port = await pickFreePort();
        expect(typeof port).toBe("number");
        expect(port).toBeGreaterThan(0);
        expect(port).toBeLessThan(65536);
    });
});

describe("resolveTmuxBin", () => {
    it("uses the repo apps/desktop/engines/tmux/tmux path in dev when it exists", () => {
        const existsSync = (p: string) => p === "/repo/apps/desktop/engines/tmux/tmux";
        const bin = resolveTmuxBin({ isPackaged: false, repoRoot: "/repo", existsSync });
        expect(bin).toBe("/repo/apps/desktop/engines/tmux/tmux");
    });

    it("prefers the bundled extraResources path when packaged", () => {
        const existsSync = (p: string) => p === "/Resources/backend/engines/tmux/tmux";
        const bin = resolveTmuxBin({
            isPackaged: true,
            repoRoot: "/repo",
            resourcesPath: "/Resources",
            existsSync,
        });
        expect(bin).toBe("/Resources/backend/engines/tmux/tmux");
    });

    it("returns a best-effort default (never empty) when nothing exists", () => {
        const bin = resolveTmuxBin({ isPackaged: false, repoRoot: "/repo", existsSync: () => false });
        expect(bin).toBeTruthy();
        expect(bin).toContain("tmux");
    });
});

describe("loadOrCreateSecrets", () => {
    it("generates and persists secrets on first run", () => {
        const fs = makeMemFs();
        const secretsPath = "/ud/secrets.json";
        const out = loadOrCreateSecrets({ secretsPath, fs: fs as unknown as FsLike });
        expect(out.apiKeyHashSalt).toMatch(/^[0-9a-f]{64}$/);
        expect(out.internalServiceKey).toMatch(/^[0-9a-f]{64}$/);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            secretsPath,
            expect.any(String),
            expect.objectContaining({ mode: 0o600 })
        );
    });

    it("reuses persisted secrets on subsequent runs (stable salt)", () => {
        const fs = makeMemFs() as unknown as FsLike;
        const secretsPath = "/ud/secrets.json";
        const first = loadOrCreateSecrets({ secretsPath, fs });
        const second = loadOrCreateSecrets({ secretsPath, fs });
        expect(second).toEqual(first);
    });

    it("regenerates when the persisted secrets file is corrupt", () => {
        const fs = makeMemFs({ "/ud/secrets.json": "not-json{" }) as unknown as FsLike;
        const out = loadOrCreateSecrets({ secretsPath: "/ud/secrets.json", fs });
        expect(out.apiKeyHashSalt).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("assembleBackendEnv", () => {
    it("assembles a hermetic env without mutating the base env", () => {
        const baseEnv: NodeJS.ProcessEnv = { PATH: "/bin", NODE_ENV: undefined };
        const env = assembleBackendEnv({
            baseEnv,
            port: 45678,
            dataDir: "/ud/backend-data",
            tmuxBin: "/repo/apps/desktop/engines/tmux/tmux",
            apiKeyHashSalt: "salt123",
            internalServiceKey: "internal123",
        });
        expect(env.PORT).toBe("45678");
        expect(env.DATA_DIR).toBe("/ud/backend-data");
        expect(env.STRICT_AUTH).toBe("false");
        expect(env.API_KEY_HASH_SALT).toBe("salt123");
        expect(env.INTERNAL_SERVICE_KEY).toBe("internal123");
        expect(env.CONDUCTOR_TMUX_BIN).toBe("/repo/apps/desktop/engines/tmux/tmux");
        expect(env.RECODER_TMUX_BUILD_PATH).toBe("/repo/apps/desktop/engines/tmux/tmux");
        expect(env.TMUX_BIN).toBe("/repo/apps/desktop/engines/tmux/tmux");
        expect(env.RECODER_SOLO_MODE).toBe("1");
        expect(env.PATH).toBe("/bin");
        // Embedded desktop lowers the admission disk floor to 2GB (lightweight
        // worktrees on a single-user laptop), overridable via base env.
        expect(env.CONDUCTOR_MIN_FREE_DISK_GB).toBe("2");
        expect(baseEnv.PORT).toBeUndefined();
    });

    it("honors an operator-supplied CONDUCTOR_MIN_FREE_DISK_GB override", () => {
        const env = assembleBackendEnv({
            baseEnv: { CONDUCTOR_MIN_FREE_DISK_GB: "10" },
            port: 1,
            dataDir: "/d",
            tmuxBin: "/t",
            apiKeyHashSalt: "s",
            internalServiceKey: "i",
        });
        expect(env.CONDUCTOR_MIN_FREE_DISK_GB).toBe("10");
    });

    it("omits ELECTRON_RUN_AS_NODE in dev (electronRunAsNode falsy)", () => {
        const env = assembleBackendEnv({
            baseEnv: {},
            port: 1,
            dataDir: "/d",
            tmuxBin: "/t",
            apiKeyHashSalt: "s",
            internalServiceKey: "i",
        });
        expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    });

    it("sets ELECTRON_RUN_AS_NODE=1 when packaged (process.execPath is Electron)", () => {
        const env = assembleBackendEnv({
            baseEnv: {},
            port: 1,
            dataDir: "/d",
            tmuxBin: "/t",
            apiKeyHashSalt: "s",
            internalServiceKey: "i",
            electronRunAsNode: true,
        });
        expect(env.ELECTRON_RUN_AS_NODE).toBe("1");
    });

    it("augments PATH with the login-shell PATH (installed agents become resolvable)", () => {
        const env = assembleBackendEnv({
            baseEnv: { PATH: "/usr/bin:/bin" },
            port: 1,
            dataDir: "/d",
            tmuxBin: "/t",
            apiKeyHashSalt: "s",
            internalServiceKey: "i",
            loginShellPath: "/opt/homebrew/bin:/usr/bin:/Users/me/.local/bin",
        });
        expect(env.PATH).toBe("/usr/bin:/bin:/opt/homebrew/bin:/Users/me/.local/bin");
    });
});

describe("mergePathIntoEnv", () => {
    it("is a no-op when there is no extra PATH", () => {
        const base = { PATH: "/bin" };
        expect(mergePathIntoEnv(base, "")).toBe(base);
    });

    it("appends and de-duplicates while preserving order, without mutating input", () => {
        const base = { PATH: "/usr/bin:/bin" };
        const out = mergePathIntoEnv(base, "/bin:/opt/homebrew/bin", ":");
        expect(out.PATH).toBe("/usr/bin:/bin:/opt/homebrew/bin");
        expect(base.PATH).toBe("/usr/bin:/bin");
    });
});

describe("resolveLoginShellPath", () => {
    it('returns "" on win32 without spawning a shell', () => {
        const execFileSync = vi.fn();
        expect(resolveLoginShellPath({ platform: "win32", execFileSync: execFileSync as any })).toBe("");
        expect(execFileSync).not.toHaveBeenCalled();
    });

    it("parses the delimited PATH from the login shell output", () => {
        const execFileSync = vi.fn(
            () => "rc-file noise\n__RECODER_PATH_DELIM__/opt/homebrew/bin:/usr/bin__RECODER_PATH_DELIM__\n"
        );
        const out = resolveLoginShellPath({
            platform: "darwin",
            shell: "/bin/zsh",
            execFileSync: execFileSync as any,
        });
        expect(out).toBe("/opt/homebrew/bin:/usr/bin");
        expect(execFileSync).toHaveBeenCalledWith("/bin/zsh", expect.arrayContaining(["-ilc"]), expect.any(Object));
    });

    it('degrades to "" when the shell invocation throws', () => {
        const execFileSync = vi.fn(() => {
            throw new Error("shell missing");
        });
        expect(resolveLoginShellPath({ platform: "darwin", execFileSync: execFileSync as any })).toBe("");
    });
});

describe("backendUrlForPort", () => {
    it("builds a 127.0.0.1 loopback url", () => {
        expect(backendUrlForPort(3100)).toBe("http://127.0.0.1:3100");
    });

    it("gatewayEndpointForPort points at the chat-completions route", () => {
        expect(gatewayEndpointForPort(3100)).toBe("http://127.0.0.1:3100/api/gateway/v1/chat/completions");
    });
});

describe("backoffMs", () => {
    it("grows exponentially and caps", () => {
        expect(backoffMs(1)).toBe(1000);
        expect(backoffMs(2)).toBe(2000);
        expect(backoffMs(3)).toBe(4000);
        expect(backoffMs(100, { maxMs: 30000 })).toBe(30000);
    });
});

// ---------------------------------------------------------------------------
// AI-gateway config writer
// ---------------------------------------------------------------------------

describe("writeWaveAIGatewayConfig", () => {
    it("writes a waveai@recoder mode with live endpoint + minted key and sets the default mode", () => {
        const fs = makeMemFs();
        const result = writeWaveAIGatewayConfig({
            configDir: "/cfg",
            port: 3100,
            apiKey: "sk_minted",
            fs: fs as unknown as FsLike,
        });
        const waveai = JSON.parse(fs.files.get(path.join("/cfg", "waveai.json")));
        const mode = waveai["waveai@recoder"];
        expect(mode["ai:provider"]).toBe("openai");
        expect(mode["ai:apitype"]).toBe("openai-chat");
        expect(mode["ai:endpoint"]).toBe("http://127.0.0.1:3100/api/gateway/v1/chat/completions");
        expect(mode["ai:apitoken"]).toBe("sk_minted");
        const settings = JSON.parse(fs.files.get(path.join("/cfg", "settings.json")));
        expect(settings["waveai:defaultmode"]).toBe("waveai@recoder");
        expect(result.defaultModeSet).toBe(true);
    });

    it("merges into existing files without clobbering other keys", () => {
        const fs = makeMemFs({
            [path.join("/cfg", "waveai.json")]: JSON.stringify({ "waveai@mine": { "ai:model": "x" } }),
            [path.join("/cfg", "settings.json")]: JSON.stringify({
                "term:fontsize": 14,
                "waveai:defaultmode": "waveai@balanced",
            }),
        });
        writeWaveAIGatewayConfig({ configDir: "/cfg", port: 4000, apiKey: "sk_a", fs: fs as unknown as FsLike });
        const waveai = JSON.parse(fs.files.get(path.join("/cfg", "waveai.json")));
        expect(waveai["waveai@mine"]).toEqual({ "ai:model": "x" });
        expect(waveai["waveai@recoder"]["ai:endpoint"]).toContain(":4000/");
        const settings = JSON.parse(fs.files.get(path.join("/cfg", "settings.json")));
        expect(settings["term:fontsize"]).toBe(14);
        // A builtin default gets upgraded to the embedded gateway mode.
        expect(settings["waveai:defaultmode"]).toBe("waveai@recoder");
    });

    it("respects a user-picked custom default mode (does not stomp it)", () => {
        const fs = makeMemFs({
            [path.join("/cfg", "settings.json")]: JSON.stringify({ "waveai:defaultmode": "waveai@mycustom" }),
        });
        const result = writeWaveAIGatewayConfig({
            configDir: "/cfg",
            port: 4000,
            apiKey: "sk_a",
            fs: fs as unknown as FsLike,
        });
        expect(result.defaultModeSet).toBe(false);
        const settings = JSON.parse(fs.files.get(path.join("/cfg", "settings.json")));
        expect(settings["waveai:defaultmode"]).toBe("waveai@mycustom");
    });

    it("uses a placeholder token on mint failure (STRICT_AUTH=false loopback degrade)", () => {
        const fs = makeMemFs();
        writeWaveAIGatewayConfig({ configDir: "/cfg", port: 3100, apiKey: null, fs: fs as unknown as FsLike });
        const waveai = JSON.parse(fs.files.get(path.join("/cfg", "waveai.json")));
        expect(waveai["waveai@recoder"]["ai:apitoken"]).toBe("recoder-local-unauthenticated");
    });
});

describe("writeCockpitWidgetConfig", () => {
    it("writes the full cockpit widget object pinned to the live port", () => {
        const fs = makeMemFs();
        const { widgetsPath } = writeCockpitWidgetConfig({
            configDir: "/cfg",
            port: 3105,
            fs: fs as unknown as FsLike,
        });
        expect(widgetsPath).toBe(path.join("/cfg", "widgets.json"));
        const widgets = JSON.parse(fs.files.get(widgetsPath));
        const entry = widgets["defwidget@recoder-cockpit"];
        // wconfig simple-merge replaces the whole key, so every field of the
        // embedded default must be present here.
        expect(entry.label).toBe("cockpit");
        expect(entry.icon).toBe("gauge-high");
        expect(entry["display:order"]).toBe(-5.005);
        expect(entry.blockdef.meta.view).toBe("web");
        expect(entry.blockdef.meta.url).toBe("http://127.0.0.1:3105/cockpit/");
    });

    it("merges into an existing widgets.json without clobbering user widgets", () => {
        const fs = makeMemFs({
            [path.join("/cfg", "widgets.json")]: JSON.stringify({ "widget@mine": { label: "mine" } }),
        });
        writeCockpitWidgetConfig({ configDir: "/cfg", port: 3100, fs: fs as unknown as FsLike });
        const widgets = JSON.parse(fs.files.get(path.join("/cfg", "widgets.json")));
        expect(widgets["widget@mine"]).toEqual({ label: "mine" });
        expect(widgets["defwidget@recoder-cockpit"].blockdef.meta.url).toBe("http://127.0.0.1:3100/cockpit/");
    });

    it("recovers from a corrupt widgets.json instead of throwing", () => {
        const fs = makeMemFs({ [path.join("/cfg", "widgets.json")]: "not-json{" });
        writeCockpitWidgetConfig({ configDir: "/cfg", port: 3100, fs: fs as unknown as FsLike });
        const widgets = JSON.parse(fs.files.get(path.join("/cfg", "widgets.json")));
        expect(widgets["defwidget@recoder-cockpit"].blockdef.meta.url).toBe("http://127.0.0.1:3100/cockpit/");
    });
});

// ---------------------------------------------------------------------------
// Health polling
// ---------------------------------------------------------------------------

describe("pollHealth", () => {
    it("resolves ok on a 200 success envelope", async () => {
        const fetchImpl = vi.fn(async () => ({
            status: 200,
            json: async () => ({ success: true, data: { available: true } }),
        }));
        const result = await pollHealth({
            backendUrl: "http://127.0.0.1:45678",
            apiKey: "sk_x",
            fetch: fetchImpl as any,
            sleep: noopSleep,
            timeoutMs: 1000,
            intervalMs: 1,
        });
        expect(result.ok).toBe(true);
        expect(result.attempts).toBe(1);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        // sends the key on both header forms
        const headers = (fetchImpl.mock.calls[0] as any)[1].headers;
        expect(headers["x-api-key"]).toBe("sk_x");
        expect(headers.Authorization).toBe("Bearer sk_x");
    });

    it("retries while the endpoint is not yet up, then succeeds", async () => {
        let calls = 0;
        const fetchImpl = vi.fn(async () => {
            calls += 1;
            if (calls < 3) {
                throw new Error("ECONNREFUSED");
            }
            return { status: 200, json: async () => ({ success: true }) };
        });
        const result = await pollHealth({
            backendUrl: "http://127.0.0.1:45678",
            fetch: fetchImpl as any,
            sleep: noopSleep,
            timeoutMs: 1000,
            intervalMs: 1,
        });
        expect(result.ok).toBe(true);
        expect(result.attempts).toBe(3);
    });

    it("times out truthfully (never fakes ready)", async () => {
        let t = 0;
        const now = () => {
            t += 10;
            return t;
        };
        const fetchImpl = vi.fn(async () => {
            throw new Error("ECONNREFUSED");
        });
        const result = await pollHealth({
            backendUrl: "http://127.0.0.1:45678",
            fetch: fetchImpl as any,
            sleep: noopSleep,
            now,
            timeoutMs: 30,
            intervalMs: 1,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/timeout/);
        expect(result.reason).toMatch(/ECONNREFUSED/);
    });

    it("bails out early when the backend process has exited", async () => {
        const fetchImpl = vi.fn();
        const result = await pollHealth({
            backendUrl: "http://127.0.0.1:45678",
            fetch: fetchImpl as any,
            sleep: noopSleep,
            isAlive: () => false,
            timeoutMs: 1000,
            intervalMs: 1,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("backend-process-exited");
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Supervisor lifecycle
// ---------------------------------------------------------------------------

describe("BackendSupervisor.start", () => {
    it("requires userDataDir and repoRoot", () => {
        expect(() => new BackendSupervisor({} as any)).toThrow(/userDataDir and repoRoot/);
    });

    it("picks a port, mints a key, spawns the child, and reaches READY on healthy backend", async () => {
        const child = makeFakeChild();
        const spawn = vi.fn(() => child);
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const onReady = vi.fn();
        const opts = baseOptions({ spawn, fetchImpl, onReady });
        const sup = new BackendSupervisor(opts as any);

        const result = await sup.start();

        expect(result.ok).toBe(true);
        expect(sup.phase).toBe(PHASE.READY);
        expect(sup.getStatus().ready).toBe(true);
        expect(opts.pickFreePort).toHaveBeenCalled();
        expect(opts.mintKey).toHaveBeenCalled();
        // spawn used tsx + src/server.ts in dev
        expect(spawn).toHaveBeenCalled();
        const [command, args] = spawn.mock.calls[0] as any;
        expect(command).toContain("tsx");
        expect(args[0]).toContain("backend/src/server.ts");
        // getAuth exposes the supervised backendUrl + minted key
        const auth = sup.getAuth();
        expect(auth).toEqual({ backendUrl: "http://127.0.0.1:45678", apiKey: "sk_test_minted_key" });
        // onReady fires only on TRUE readiness, with the live port + key
        expect(onReady).toHaveBeenCalledWith({
            port: 45678,
            backendUrl: "http://127.0.0.1:45678",
            apiKey: "sk_test_minted_key",
        });
    });

    it("getAuth() returns null until READY (never points consumers at a down backend)", async () => {
        const sup = new BackendSupervisor(baseOptions() as any);
        expect(sup.getAuth()).toBeNull();
    });

    it("marks FAILED (not ready) when health never comes up, kills the child, and never calls onReady", async () => {
        const child = makeFakeChild();
        const spawn = vi.fn(() => child);
        let t = 0;
        const now = () => {
            t += 20;
            return t;
        };
        const fetchImpl = vi.fn(async () => {
            throw new Error("ECONNREFUSED");
        });
        const onReady = vi.fn();
        const sup = new BackendSupervisor(
            baseOptions({ spawn, fetchImpl, now, onReady, healthTimeoutMs: 40, healthIntervalMs: 1 }) as any
        );

        const result = await sup.start();

        expect(result.ok).toBe(false);
        expect(sup.phase).toBe(PHASE.FAILED);
        expect(sup.getAuth()).toBeNull();
        expect(child.killed).toBe(true);
        expect(result.reason).toMatch(/health check failed/);
        expect(onReady).not.toHaveBeenCalled();
    });

    it("continues (warns) when key mint fails — STRICT_AUTH=false still serves loopback", async () => {
        const mintKey = vi.fn(() => Promise.reject(new Error("mint boom")));
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const sup = new BackendSupervisor(baseOptions({ mintKey, fetchImpl }) as any);

        const result = await sup.start();

        expect(result.ok).toBe(true);
        expect(sup.phase).toBe(PHASE.READY);
        expect(sup.getAuth()).toEqual({ backendUrl: "http://127.0.0.1:45678", apiKey: null });
    });

    it("is idempotent: concurrent start() calls share one boot", async () => {
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const opts = baseOptions({ fetchImpl });
        const sup = new BackendSupervisor(opts as any);
        const [a, b] = await Promise.all([sup.start(), sup.start()]);
        expect(a.ok).toBe(true);
        expect(b.ok).toBe(true);
        expect(opts.spawn).toHaveBeenCalledTimes(1);
    });

    it("uses the pre-planned preferredPort when it is free", async () => {
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const opts = baseOptions({
            fetchImpl,
            preferredPort: 3123,
            portIsFree: vi.fn(() => Promise.resolve(true)),
        });
        const sup = new BackendSupervisor(opts as any);
        const result = await sup.start();
        expect(result.ok).toBe(true);
        expect(sup.port).toBe(3123);
        expect(opts.pickFreePort).not.toHaveBeenCalled();
    });
});

describe("BackendSupervisor crash + stop lifecycle", () => {
    it("restarts on crash with backoff (until READY) and clears the crash count", async () => {
        const children: ReturnType<typeof makeFakeChild>[] = [];
        const spawn = vi.fn(() => {
            const c = makeFakeChild();
            children.push(c);
            return c;
        });
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        // jitter 0: the test waits backoffMs(1)+50, so any jitter > 50ms would
        // make the restart assertion time-dependent (flaky).
        const sup = new BackendSupervisor(baseOptions({ spawn, fetchImpl, maxRestarts: 3, restartJitterMs: 0 }) as any);

        await sup.start();
        expect(sup.phase).toBe(PHASE.READY);
        expect(children.length).toBe(1);

        // Simulate the running backend crashing — the app must DEGRADE, not quit.
        children[0]._emit("exit", 1, null);
        expect([PHASE.CRASHED, PHASE.STARTING, PHASE.READY]).toContain(sup.phase);
        expect(sup.restartCount).toBe(1);

        await new Promise((r) => setTimeout(r, backoffMs(1) + 50));
        expect(children.length).toBe(2);
        expect(sup.phase).toBe(PHASE.READY);
        expect(sup.restartCount).toBe(0);
    });

    it("gives up after maxRestarts and reports FAILED truthfully", async () => {
        const spawn = vi.fn(() => makeFakeChild());
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const sup = new BackendSupervisor(baseOptions({ spawn, fetchImpl, maxRestarts: 1 }) as any);
        await sup.start();

        sup.restartCount = 1;
        (sup.child as any)._emit("exit", 1, null);

        expect(sup.phase).toBe(PHASE.FAILED);
        expect(sup.lastError).toMatch(/giving up/);
        expect(sup.getStatus().userMessage).toMatch(/could not start/);
    });

    it("stop() prevents restart and kills the child", async () => {
        const child = makeFakeChild();
        const spawn = vi.fn(() => child);
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const sup = new BackendSupervisor(baseOptions({ spawn, fetchImpl }) as any);
        await sup.start();

        await sup.stop();
        expect(sup.phase).toBe(PHASE.STOPPED);
        expect(child.killed).toBe(true);
        expect(child._killSignal).toBe("SIGTERM");

        // A late exit event after stop must NOT trigger a restart.
        const spawnCallsBefore = spawn.mock.calls.length;
        child._emit("exit", null, "SIGTERM");
        await new Promise((r) => setTimeout(r, backoffMs(1) + 50));
        expect(spawn.mock.calls.length).toBe(spawnCallsBefore);
        expect(sup.phase).toBe(PHASE.STOPPED);
    });
});

describe("BackendSupervisor packaged spawn target", () => {
    it("runs node dist/server.js from resourcesPath/backend when packaged", async () => {
        const child = makeFakeChild();
        const spawn = vi.fn(() => child);
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const sup = new BackendSupervisor(
            baseOptions({
                spawn,
                fetchImpl,
                isPackaged: true,
                resourcesPath: "/Resources",
            }) as any
        );
        await sup.start();
        const [command, args, spawnOpts] = spawn.mock.calls[0] as any;
        expect(command).toBe(process.execPath);
        expect(args[0]).toBe(path.join("/Resources", "backend", "dist", "server.js"));
        expect(spawnOpts.cwd).toBe(path.join("/Resources", "backend"));
    });
});

// ---------------------------------------------------------------------------
// Fail-closed auth: the minted key must be REQUIRED, not decorative
// ---------------------------------------------------------------------------

describe("BackendSupervisor auth posture", () => {
    it("runs the child STRICT (fail-closed) when the key mint succeeded", async () => {
        const child = makeFakeChild();
        const spawn = vi.fn(() => child);
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const sup = new BackendSupervisor(baseOptions({ spawn, fetchImpl }) as any);

        const result = await sup.start();

        expect(result.ok).toBe(true);
        const [, , spawnOpts] = spawn.mock.calls[0] as any;
        expect(spawnOpts.env.STRICT_AUTH).toBe("true");
    });

    it("degrades to STRICT_AUTH=false ONLY when the mint failed (documented loopback fallback)", async () => {
        const child = makeFakeChild();
        const spawn = vi.fn(() => child);
        const mintKey = vi.fn(() => Promise.reject(new Error("mint boom")));
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const sup = new BackendSupervisor(baseOptions({ spawn, mintKey, fetchImpl }) as any);

        const result = await sup.start();

        expect(result.ok).toBe(true);
        const [, , spawnOpts] = spawn.mock.calls[0] as any;
        expect(spawnOpts.env.STRICT_AUTH).toBe("false");
    });
});
