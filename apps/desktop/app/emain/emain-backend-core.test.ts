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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    assembleBackendEnv,
    BackendSupervisor,
    backendUrlForPort,
    backoffMs,
    describeVectorStore,
    fetchEngineRoster,
    FsLike,
    gatewayEndpointForPort,
    loadOrCreateSecrets,
    mergePathIntoEnv,
    parseEngineRoster,
    PHASE,
    pickFreePort,
    pollHealth,
    resolveBeadsBinPath,
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

describe("resolveBeadsBinPath", () => {
    const savedBeadsBin = process.env.BEADS_BIN;

    beforeEach(() => {
        delete process.env.BEADS_BIN;
    });

    afterEach(() => {
        if (savedBeadsBin == null) {
            delete process.env.BEADS_BIN;
        } else {
            process.env.BEADS_BIN = savedBeadsBin;
        }
    });

    it("prefers the bundled extraResources bd when packaged", () => {
        const existsSync = (p: string) => p === "/Resources/backend/engines/beads/bin/bd";
        const bin = resolveBeadsBinPath({
            isPackaged: true,
            repoRoot: "/repo",
            resourcesPath: "/Resources",
            existsSync,
        });
        expect(bin).toBe("/Resources/backend/engines/beads/bin/bd");
    });

    it("uses the owned repo build in dev when it exists", () => {
        const existsSync = (p: string) => p === "/repo/apps/desktop/server/engines/beads/bin/bd";
        const bin = resolveBeadsBinPath({ isPackaged: false, repoRoot: "/repo", existsSync });
        expect(bin).toBe("/repo/apps/desktop/server/engines/beads/bin/bd");
    });

    it("returns null when no candidate exists (fill-only — backend resolver stays the truthful gate)", () => {
        const bin = resolveBeadsBinPath({
            isPackaged: true,
            repoRoot: "/repo",
            resourcesPath: "/Resources",
            existsSync: () => false,
        });
        expect(bin).toBeNull();
    });

    it("an explicit BEADS_BIN env always wins", () => {
        process.env.BEADS_BIN = "/operator/bd";
        const bin = resolveBeadsBinPath({
            isPackaged: true,
            repoRoot: "/repo",
            resourcesPath: "/Resources",
            existsSync: (p: string) => p === "/Resources/backend/engines/beads/bin/bd",
        });
        expect(bin).toBe("/operator/bd");
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

    it("injects BEADS_BIN fill-only when a resolved bd path is supplied", () => {
        const env = assembleBackendEnv({
            baseEnv: {},
            port: 1,
            dataDir: "/d",
            tmuxBin: "/t",
            apiKeyHashSalt: "s",
            internalServiceKey: "i",
            beadsBin: "/Resources/backend/engines/beads/bin/bd",
        });
        expect(env.BEADS_BIN).toBe("/Resources/backend/engines/beads/bin/bd");
    });

    it("never overrides an explicit BEADS_BIN and leaves it absent when unresolved", () => {
        const overridden = assembleBackendEnv({
            baseEnv: { BEADS_BIN: "/operator/bd" },
            port: 1,
            dataDir: "/d",
            tmuxBin: "/t",
            apiKeyHashSalt: "s",
            internalServiceKey: "i",
            beadsBin: "/Resources/backend/engines/beads/bin/bd",
        });
        expect(overridden.BEADS_BIN).toBe("/operator/bd");
        const absent = assembleBackendEnv({
            baseEnv: {},
            port: 1,
            dataDir: "/d",
            tmuxBin: "/t",
            apiKeyHashSalt: "s",
            internalServiceKey: "i",
            beadsBin: null,
        });
        expect(absent.BEADS_BIN).toBeUndefined();
    });

    it("propagates TMUX_TMPDIR unchanged so the backend shares the conductor's default tmux socket (§A1b)", () => {
        const env = assembleBackendEnv({
            baseEnv: { TMUX_TMPDIR: "/private/var/folders/xyz/T" },
            port: 1,
            dataDir: "/d",
            tmuxBin: "/t",
            apiKeyHashSalt: "s",
            internalServiceKey: "i",
        });
        expect(env.TMUX_TMPDIR).toBe("/private/var/folders/xyz/T");
    });

    it("never invents TMUX_TMPDIR when absent (both sides default to /tmp identically)", () => {
        const env = assembleBackendEnv({
            baseEnv: {},
            port: 1,
            dataDir: "/d",
            tmuxBin: "/t",
            apiKeyHashSalt: "s",
            internalServiceKey: "i",
        });
        expect(env.TMUX_TMPDIR).toBeUndefined();
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

describe("assembleBackendEnv native runtime injection", () => {
    const base = {
        port: 1,
        dataDir: "/d",
        tmuxBin: "/t",
        apiKeyHashSalt: "s",
        internalServiceKey: "i",
    };

    it("injects BYOK secrets fill-only (an explicit base env var wins)", () => {
        const env = assembleBackendEnv({
            ...base,
            baseEnv: { SAMBANOVA_API_KEY: "from-shell" },
            byokSecrets: { SAMBANOVA_API_KEY: "from-store", CEREBRAS_API_KEY: "cb-store" },
        });
        expect(env.SAMBANOVA_API_KEY).toBe("from-shell");
        expect(env.CEREBRAS_API_KEY).toBe("cb-store");
    });

    it("skips empty BYOK values (never injects a blank key)", () => {
        const env = assembleBackendEnv({
            ...base,
            baseEnv: {},
            byokSecrets: { CEREBRAS_API_KEY: "   " },
        });
        expect(env.CEREBRAS_API_KEY).toBeUndefined();
    });

    it("injects the resolved openfang/tensorzero env and omits null pieces", () => {
        const env = assembleBackendEnv({
            ...base,
            baseEnv: {},
            openfang: {
                addonPath: "/Resources/native/openfang_napi.node",
                homeDir: "/ud/backend-data/openfang",
                configPath: null,
                tensorzeroAddonPath: "/Resources/native/tensorzero_gateway_napi.node",
            },
        });
        expect(env.OPENFANG_NATIVE_ADDON).toBe("/Resources/native/openfang_napi.node");
        expect(env.OPENFANG_HOME).toBe("/ud/backend-data/openfang");
        expect(env.OPENFANG_CONFIG).toBeUndefined();
        expect(env.TENSORZERO_GATEWAY_NAPI_NODE).toBe("/Resources/native/tensorzero_gateway_napi.node");
    });

    it("never overrides an explicit openfang env var from the base env", () => {
        const env = assembleBackendEnv({
            ...base,
            baseEnv: { OPENFANG_NATIVE_ADDON: "/custom.node" },
            openfang: {
                addonPath: "/resolved.node",
                homeDir: null,
                configPath: null,
                tensorzeroAddonPath: null,
            },
        });
        expect(env.OPENFANG_NATIVE_ADDON).toBe("/custom.node");
    });

    it("injects the embedded-vector env (nativeDir + LANCE_DATA_DIR) when resolved", () => {
        const env = assembleBackendEnv({
            ...base,
            baseEnv: {},
            vector: { nativeDir: "/Resources/native", lanceDataDir: "/ud/backend-data/lance" },
        });
        expect(env.RECODER_NATIVE_DIR).toBe("/Resources/native");
        expect(env.LANCE_NATIVE_DIR).toBe("/Resources/native");
        expect(env.LANCE_DATA_DIR).toBe("/ud/backend-data/lance");
    });

    it("omits LANCE_DATA_DIR when the addon is absent (not an empty string)", () => {
        const env = assembleBackendEnv({
            ...base,
            baseEnv: {},
            vector: { nativeDir: "/Resources/native", lanceDataDir: null },
        });
        expect(env.RECODER_NATIVE_DIR).toBe("/Resources/native");
        expect(env.LANCE_DATA_DIR).toBeUndefined();
    });

    it("never overrides an explicit vector env var from the base env", () => {
        const env = assembleBackendEnv({
            ...base,
            baseEnv: { RECODER_NATIVE_DIR: "/custom/native", LANCE_DATA_DIR: "/custom/lance" },
            vector: { nativeDir: "/Resources/native", lanceDataDir: "/ud/backend-data/lance" },
        });
        expect(env.RECODER_NATIVE_DIR).toBe("/custom/native");
        expect(env.LANCE_DATA_DIR).toBe("/custom/lance");
    });

    it("injects connector secrets fill-only (an explicit base env URL wins)", () => {
        const env = assembleBackendEnv({
            ...base,
            baseEnv: { MEM0_BASE_URL: "https://from-shell.example" },
            connectorSecrets: {
                MEM0_BASE_URL: "https://from-store.example",
                COLBERT_RERANK_URL: "https://rerank.example",
            },
        });
        expect(env.MEM0_BASE_URL).toBe("https://from-shell.example");
        expect(env.COLBERT_RERANK_URL).toBe("https://rerank.example");
    });

    it("skips empty connector values and leaves absent capabilities unset (truthful down)", () => {
        const env = assembleBackendEnv({
            ...base,
            baseEnv: {},
            connectorSecrets: { COLBERT_RERANK_URL: "   " },
        });
        expect(env.COLBERT_RERANK_URL).toBeUndefined();
        expect(env.MEM0_BASE_URL).toBeUndefined();
    });

    it("does not mutate the input baseEnv (purity)", () => {
        const baseEnv: NodeJS.ProcessEnv = {};
        assembleBackendEnv({
            ...base,
            baseEnv,
            vector: { nativeDir: "/Resources/native", lanceDataDir: "/ud/backend-data/lance" },
            connectorSecrets: { MEM0_BASE_URL: "https://store.example" },
        });
        expect(baseEnv.RECODER_NATIVE_DIR).toBeUndefined();
        expect(baseEnv.MEM0_BASE_URL).toBeUndefined();
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
// Truthful engine roster
// ---------------------------------------------------------------------------

function rosterPayload(engines: Array<Record<string, unknown>>) {
    return {
        status: 200,
        json: async () => ({
            success: true,
            data: { count: engines.length, up: engines.filter((e) => e.status === "up").length, engines },
        }),
    };
}

describe("parseEngineRoster", () => {
    it("splits engines by their OWN reported status — no hardcoded names", () => {
        const roster = parseEngineRoster({
            success: true,
            data: {
                engines: [
                    { engineId: "beads", transport: "cli", status: "up", checkedAt: "t" },
                    { engineId: "openfang", transport: "napi", status: "up", checkedAt: "t" },
                    {
                        engineId: "mem0",
                        transport: "sidecar",
                        status: "down",
                        reason: "uv venv absent",
                        checkedAt: "t",
                    },
                    {
                        engineId: "colbert",
                        transport: "daemon",
                        status: "degraded",
                        reason: "not packaged",
                        checkedAt: "t",
                    },
                ],
            },
        });
        expect(roster.known).toBe(true);
        expect(roster.alive).toEqual(["beads:cli", "openfang:napi"]);
        expect(roster.degraded.map((e) => e.name)).toEqual(["mem0:sidecar", "colbert:daemon"]);
        // Degraded entries carry the endpoint's OWN reason.
        expect(roster.degraded[0].reason).toBe("uv venv absent");
        expect(roster.degraded[1].reason).toBe("not packaged");
    });

    it("accepts the already-flattened {name,status} shape too", () => {
        const roster = parseEngineRoster({ data: { engines: [{ name: "tmux:cli", status: "up" }] } });
        expect(roster.alive).toEqual(["tmux:cli"]);
    });

    it("returns an UNKNOWN roster (truthful) when there is no engines array", () => {
        const roster = parseEngineRoster({ success: true });
        expect(roster.known).toBe(false);
        expect(roster.alive).toEqual([]);
        expect(roster.reason).toMatch(/unexpected/);
    });
});

describe("fetchEngineRoster", () => {
    it("sends the internal-service-key header and surfaces a 200 roster", async () => {
        const fetchImpl = vi.fn(async () => rosterPayload([{ engineId: "beads", transport: "cli", status: "up" }]));
        const roster = await fetchEngineRoster({
            backendUrl: "http://127.0.0.1:3100",
            internalServiceKey: "internal-abc",
            fetch: fetchImpl as any,
        });
        expect(roster.known).toBe(true);
        expect(roster.alive).toEqual(["beads:cli"]);
        const [url, init] = fetchImpl.mock.calls[0] as any;
        expect(url).toBe("http://127.0.0.1:3100/internal/engines/health");
        expect(init.headers["x-internal-service-key"]).toBe("internal-abc");
    });

    it("returns UNKNOWN (no throw) when the key is absent — never a fabricated alive list", async () => {
        const fetchImpl = vi.fn();
        const roster = await fetchEngineRoster({
            backendUrl: "http://127.0.0.1:3100",
            fetch: fetchImpl as any,
        });
        expect(roster.known).toBe(false);
        expect(roster.reason).toMatch(/no internal service key/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("returns UNKNOWN on a 401 (roster unavailable, not faked up)", async () => {
        const fetchImpl = vi.fn(async () => ({ status: 401, json: async () => ({}) }));
        const roster = await fetchEngineRoster({
            backendUrl: "http://127.0.0.1:3100",
            internalServiceKey: "bad",
            fetch: fetchImpl as any,
        });
        expect(roster.known).toBe(false);
        expect(roster.reason).toBe("status-401");
    });

    it("returns UNKNOWN (no throw) when the fetch rejects", async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error("ECONNREFUSED");
        });
        const roster = await fetchEngineRoster({
            backendUrl: "http://127.0.0.1:3100",
            internalServiceKey: "k",
            fetch: fetchImpl as any,
        });
        expect(roster.known).toBe(false);
        expect(roster.reason).toMatch(/ECONNREFUSED/);
    });
});

describe("describeVectorStore", () => {
    it("is alive with the data dir when the lance addon was packaged", () => {
        expect(describeVectorStore({ nativeDir: "/n", lanceDataDir: "/ud/lance" })).toEqual({
            lance: "alive",
            dataDir: "/ud/lance",
            reason: null,
        });
    });

    it("degrades truthfully (Lance derived from packaging, not the engine roster)", () => {
        const status = describeVectorStore({ nativeDir: "/n", lanceDataDir: null });
        expect(status.lance).toBe("degraded");
        expect(status.dataDir).toBeNull();
        expect(status.reason).toMatch(/no native lance addon/);
        expect(describeVectorStore(null).lance).toBe("degraded");
    });
});

describe("BackendSupervisor engine roster surfacing", () => {
    function routingFetch(rosterEngines: Array<Record<string, unknown>> | "fail") {
        return vi.fn(async (url: string) => {
            if (String(url).includes("/internal/engines/health")) {
                if (rosterEngines === "fail") {
                    throw new Error("ECONNREFUSED");
                }
                return rosterPayload(rosterEngines);
            }
            return { status: 200, json: async () => ({ success: true }) };
        });
    }

    it("exposes the parsed roster + packaging-derived Lance on getStatus() after READY", async () => {
        const fetchImpl = routingFetch([
            { engineId: "beads", transport: "cli", status: "up" },
            { engineId: "mem0", transport: "sidecar", status: "down", reason: "uv venv absent" },
        ]);
        const sup = new BackendSupervisor(baseOptions({ fetchImpl }) as any);

        const result = await sup.start();

        expect(result.ok).toBe(true);
        const status = sup.getStatus();
        expect(status.engines.known).toBe(true);
        expect(status.engines.alive).toEqual(["beads:cli"]);
        expect(status.engines.degraded[0]).toMatchObject({ name: "mem0:sidecar", reason: "uv venv absent" });
        // Lance is NOT on the engines payload — it is derived from packaging.
        expect(status.engines.alive).not.toContain("lance");
        expect(status.vector.lance).toBe("degraded");
        // The roster probe carried the internal key the supervisor holds.
        const rosterCall = fetchImpl.mock.calls.find(([u]: any) =>
            String(u).includes("/internal/engines/health")
        ) as any;
        expect(rosterCall[1].headers["x-internal-service-key"]).toBe(sup._internalServiceKey);
    });

    it("keeps an UNKNOWN roster (no throw, still READY) when the roster probe fails", async () => {
        const fetchImpl = routingFetch("fail");
        const sup = new BackendSupervisor(baseOptions({ fetchImpl }) as any);

        const result = await sup.start();

        expect(result.ok).toBe(true);
        expect(sup.phase).toBe(PHASE.READY);
        expect(sup.getStatus().engines.known).toBe(false);
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

describe("BackendSupervisor BYOK + openfang env injection", () => {
    // The supervisor assembles over the REAL process.env; blank out the probe
    // key so a dev shell that happens to export it cannot flip the outcome.
    beforeEach(() => vi.stubEnv("SAMBANOVA_API_KEY", ""));
    afterEach(() => vi.unstubAllEnvs());

    it("spawns the backend with the BYOK keys the injected reader returns", async () => {
        const child = makeFakeChild();
        const spawn = vi.fn(() => child);
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const readByokSecrets = vi.fn(() => ({ SAMBANOVA_API_KEY: "sk-store-test" }));
        const sup = new BackendSupervisor(baseOptions({ spawn, fetchImpl, readByokSecrets }) as any);

        const result = await sup.start();

        expect(result.ok).toBe(true);
        expect(readByokSecrets).toHaveBeenCalled();
        // The BACKEND child spawn (not the mint helper) carries the key.
        const backendSpawn = spawn.mock.calls.find(([, args]: any) => String(args[0]).includes("server.ts")) as any;
        expect(backendSpawn[2].env.SAMBANOVA_API_KEY).toBe("sk-store-test");
    });

    it("degrades to a keyless spawn (still READY) when the secret reader throws", async () => {
        const child = makeFakeChild();
        const spawn = vi.fn(() => child);
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const readByokSecrets = vi.fn(() => {
            throw new Error("keychain locked");
        });
        const sup = new BackendSupervisor(baseOptions({ spawn, fetchImpl, readByokSecrets }) as any);

        const result = await sup.start();

        expect(result.ok).toBe(true);
        expect(sup.phase).toBe(PHASE.READY);
        const backendSpawn = spawn.mock.calls.find(([, args]: any) => String(args[0]).includes("server.ts")) as any;
        // The stubbed-blank probe key stays blank — no store value leaked in.
        expect(backendSpawn[2].env.SAMBANOVA_API_KEY || "").toBe("");
    });

    it("pins a hermetic OPENFANG_HOME under the supervisor DATA_DIR in the spawn env", async () => {
        const child = makeFakeChild();
        const spawn = vi.fn(() => child);
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const opts = baseOptions({ spawn, fetchImpl });
        const sup = new BackendSupervisor(opts as any);

        const result = await sup.start();

        expect(result.ok).toBe(true);
        const backendSpawn = spawn.mock.calls.find(([, args]: any) => String(args[0]).includes("server.ts")) as any;
        const env = backendSpawn[2].env;
        if (process.env.OPENFANG_HOME) {
            // A dev shell's explicit OPENFANG_HOME always wins (fill-only).
            expect(env.OPENFANG_HOME).toBe(process.env.OPENFANG_HOME);
        } else {
            expect(env.OPENFANG_HOME).toBe(path.join(opts.userDataDir, "backend-data", "openfang"));
        }
    });
});

describe("BackendSupervisor crash + stop lifecycle", () => {
    it("restarts on crash with backoff (until READY) but KEEPS the budget on a within-window flap", async () => {
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
        // The restart happened ~1s after the last READY — far inside the default
        // 60s window. Reaching READY again must NOT forgive the crash budget,
        // otherwise a health-pass-then-crash backend restarts forever.
        expect(sup.restartCount).toBe(1);
    });

    it("bounds a health-pass-then-crash storm — reaches FAILED instead of restarting forever", async () => {
        // now() is injected so the ready->crash flap stays inside the restart
        // window deterministically (no wall-clock dependence).
        let clock = 0;
        const now = () => clock;
        const spawn = vi.fn(() => makeFakeChild());
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const sup = new BackendSupervisor(
            baseOptions({
                spawn,
                fetchImpl,
                now,
                maxRestarts: 3,
                restartWindowMs: 60000,
                restartJitterMs: 0,
            }) as any
        );

        await sup.start();
        expect(sup.phase).toBe(PHASE.READY);
        expect(sup.restartCount).toBe(0);

        // Each cycle: the backend passes health, becomes READY, then crashes ~2s
        // later — well inside the 60s window, so the budget must keep climbing.
        for (let i = 0; i < 12; i++) {
            clock += 2000;
            (sup.child as any)._emit("exit", 1, null);
            const phase: string = sup.phase;
            if (phase === PHASE.FAILED) {
                break;
            }
            // _onChildExit auto-schedules a backoff restart; cancel it and drive
            // the respawn synchronously so the assertion is timer-independent.
            if (sup._restartTimer) {
                clearTimeout(sup._restartTimer);
                sup._restartTimer = null;
            }
            await sup._startOnce();
        }

        expect(sup.phase).toBe(PHASE.FAILED);
        expect(sup.lastError).toMatch(/giving up/);
        expect(sup.restartCount).toBeLessThanOrEqual(3);
    });

    it("forgives the crash budget after the backend stayed READY for a full window", async () => {
        let clock = 0;
        const now = () => clock;
        const spawn = vi.fn(() => makeFakeChild());
        const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ success: true }) }));
        const sup = new BackendSupervisor(
            baseOptions({
                spawn,
                fetchImpl,
                now,
                maxRestarts: 3,
                restartWindowMs: 60000,
                restartJitterMs: 0,
            }) as any
        );

        await sup.start();
        sup.restartCount = 2;

        // Backend ran healthily well past the window, then died once.
        clock += 120000;
        (sup.child as any)._emit("exit", 1, null);
        // _onChildExit forgives a long healthy run; reaching READY again keeps it 0.
        expect(sup.phase).not.toBe(PHASE.FAILED);
        if (sup._restartTimer) {
            clearTimeout(sup._restartTimer);
            sup._restartTimer = null;
        }
        await sup._startOnce();
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
