// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * emain-backend-core.ts
 *
 * TypeScript port of legacy-shell/backend-supervisor.js — makes the desktop app
 * SELF-CONTAINED by booting the Node backend (conductor + gateway) on a loopback
 * port and exposing { backendUrl, apiKey } once it is actually healthy.
 *
 * Responsibilities (all real, never faked):
 *   1. Pick a free 127.0.0.1 port (prefer 3100 so default URLs work).
 *   2. Assemble a hermetic env: per-install random API_KEY_HASH_SALT and
 *      INTERNAL_SERVICE_KEY persisted to userData, a private DATA_DIR, and the
 *      resolved vendored tmux binary.
 *   3. Mint a local platform sk_ key by running the real mint script with the
 *      SAME salt + DATA_DIR the server will use.
 *   4. Spawn the backend child (dev: tsx src/server.ts; packaged: bundled node
 *      running <resourcesPath>/backend/dist/server.js).
 *   5. Poll GET /api/conductor/health until 200 (bounded; a timeout is surfaced
 *      truthfully as a failed status — never fake-ready).
 *   6. Restart-on-crash with backoff + budget. Death DEGRADES (status event);
 *      it never quits the app — that policy belongs to the Go server only.
 *
 * This module has NO electron imports so it can be unit-tested with fakes
 * (see emain-backend-core.test.ts). The electron glue lives in emain-backend.ts.
 */

import * as childProcess from "node:child_process";
import * as nodeCrypto from "node:crypto";
import * as nodeFs from "node:fs";
import * as net from "node:net";
import * as nodePath from "node:path";
import {
    EmbeddedVectorEnv,
    LANCE_DATA_DIR_ENV,
    LANCE_NATIVE_DIR_ENV,
    OPENFANG_ADDON_ENV,
    OPENFANG_CONFIG_ENV,
    OPENFANG_HOME_ENV,
    OpenfangRuntimeEnv,
    RECODER_NATIVE_DIR_ENV,
    resolveEmbeddedVectorEnv,
    resolveOpenfangRuntimeEnv,
    TENSORZERO_ADDON_ENV,
} from "./emain-backend-runtime-env";

export type SupervisorPhase = "idle" | "starting" | "ready" | "crashed" | "failed" | "stopped";

export const PHASE = Object.freeze({
    IDLE: "idle",
    STARTING: "starting",
    READY: "ready",
    CRASHED: "crashed",
    FAILED: "failed",
    STOPPED: "stopped",
} as const);

export interface StreamLike {
    on(event: string, cb: (...args: any[]) => void): unknown;
}

export interface ChildProcessLike {
    pid?: number;
    killed?: boolean;
    exitCode?: number | null;
    stdout?: StreamLike | null;
    stderr?: StreamLike | null;
    on(event: string, cb: (...args: any[]) => void): unknown;
    kill(signal?: NodeJS.Signals | number): boolean;
}

export type SpawnFn = (
    command: string,
    args: string[],
    opts: { cwd: string; env: NodeJS.ProcessEnv; stdio: any }
) => ChildProcessLike;

export interface FsLike {
    existsSync(p: string): boolean;
    readFileSync(p: string, encoding: string): string;
    writeFileSync(p: string, data: string, opts?: any): void;
    appendFileSync(p: string, data: string, encoding?: string): void;
    mkdirSync(p: string, opts?: any): void;
    chmodSync?(p: string, mode: number): void;
}

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export function pickFreePort(deps: { createServer?: typeof net.createServer } = {}): Promise<number> {
    const createServer = deps.createServer || net.createServer;
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.unref();
        let settled = false;
        const onError = (err: unknown) => {
            if (settled) {
                return;
            }
            settled = true;
            try {
                server.close();
            } catch {
                // already closing
            }
            reject(err instanceof Error ? err : new Error(String(err)));
        };
        server.on("error", onError);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                if (settled) {
                    return;
                }
                settled = true;
                server.close(() => reject(new Error("Failed to resolve a free port")));
                return;
            }
            const { port } = address;
            server.close(() => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(port);
            });
        });
    });
}

export function portIsFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.on("error", () => resolve(false));
        server.listen(port, "127.0.0.1", () => {
            server.close(() => resolve(true));
        });
    });
}

/**
 * Pick a free loopback port with bounded retries. The OS-assigned port from a
 * single port-0 bind is occasionally racy (another process can grab it between
 * close() and our spawn), so retry on transient failures. Truthfully rejects if
 * no free port can be found after `attempts` tries.
 */
export async function pickFreePortWithRetry(
    deps: { pickFreePort?: () => Promise<number>; attempts?: number; sleep?: SleepFn } = {}
): Promise<number> {
    const pick = deps.pickFreePort || (() => pickFreePort());
    const attempts = Math.max(1, deps.attempts ?? 5);
    const sleep = deps.sleep || defaultSleep;
    let lastErr: Error = null;
    for (let i = 0; i < attempts; i += 1) {
        try {
            const port = await pick();
            if (Number.isInteger(port) && port > 0 && port < 65536) {
                return port;
            }
            lastErr = new Error(`pickFreePort returned an invalid port: ${port}`);
        } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
        }
        if (i < attempts - 1) {
            await sleep(25 * (i + 1));
        }
    }
    throw new Error(
        `could not acquire a free loopback port after ${attempts} attempts` + (lastErr ? `: ${lastErr.message}` : "")
    );
}

/**
 * Resolve the vendored tmux binary path the backend should drive.
 * Dev: <repoRoot>/apps/desktop/engines/tmux/tmux. Packaged:
 * <resourcesPath>/backend/engines/tmux/tmux (bundled via extraResources).
 * Returns the first existing candidate, or the first candidate as a
 * best-effort default so the env is always set (the backend surfaces a
 * truthful "tmux missing" via /health if the path is wrong).
 */
export function resolveTmuxBin(opts: {
    isPackaged: boolean;
    repoRoot: string;
    resourcesPath?: string;
    existsSync?: (p: string) => boolean;
}): string {
    const existsSync = opts.existsSync || nodeFs.existsSync;
    const explicit = process.env.RECODER_DESKTOP_TMUX_BIN || process.env.CONDUCTOR_TMUX_BIN;
    if (explicit && explicit.trim()) {
        return explicit.trim();
    }
    const candidates: string[] = [];
    if (opts.isPackaged && opts.resourcesPath) {
        candidates.push(nodePath.join(opts.resourcesPath, "backend", "engines", "tmux", "tmux"));
        candidates.push(nodePath.join(opts.resourcesPath, "engines", "tmux", "tmux"));
    }
    const repoCandidate = nodePath.join(opts.repoRoot, "apps", "desktop", "engines", "tmux", "tmux");
    candidates.push(repoCandidate);
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0] || repoCandidate;
}

/**
 * Resolve the owned beads `bd` binary the backend's issue-graph memory shells to.
 * Packaged: <resourcesPath>/backend/engines/beads/bin/bd (bundled via
 * extraResources — never from git; the >100MB binary is built locally).
 * Dev: <repoRoot>/apps/desktop/server/engines/beads/bin/bd.
 * Unlike tmux this is FILL-ONLY: returns null when no candidate exists, so the
 * backend's own resolver (BEADS_BIN → packaged → repo build → PATH) stays the
 * single truthful availability gate instead of an explicit-but-broken override
 * masking it. An explicit BEADS_BIN env always wins.
 */
export function resolveBeadsBinPath(opts: {
    isPackaged: boolean;
    repoRoot: string;
    resourcesPath?: string;
    existsSync?: (p: string) => boolean;
}): string {
    const existsSync = opts.existsSync || nodeFs.existsSync;
    const explicit = process.env.BEADS_BIN;
    if (explicit && explicit.trim()) {
        return explicit.trim();
    }
    const candidates: string[] = [];
    if (opts.isPackaged && opts.resourcesPath) {
        candidates.push(nodePath.join(opts.resourcesPath, "backend", "engines", "beads", "bin", "bd"));
    }
    candidates.push(nodePath.join(opts.repoRoot, "apps", "desktop", "server", "engines", "beads", "bin", "bd"));
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

export interface BackendSecrets {
    apiKeyHashSalt: string;
    internalServiceKey: string;
}

/**
 * Resolve and persist the per-install secrets (salt + internal key). They live
 * in userData and are generated once, then reused so the minted key's persisted
 * hash stays valid across restarts. NEVER committed.
 */
export function loadOrCreateSecrets(opts: {
    secretsPath: string;
    fs?: FsLike;
    randomBytes?: (n: number) => Buffer;
}): BackendSecrets {
    const fs: FsLike = opts.fs || (nodeFs as unknown as FsLike);
    const randomBytes = opts.randomBytes || nodeCrypto.randomBytes;
    try {
        if (fs.existsSync(opts.secretsPath)) {
            const parsed = JSON.parse(fs.readFileSync(opts.secretsPath, "utf-8"));
            if (
                parsed &&
                typeof parsed.apiKeyHashSalt === "string" &&
                parsed.apiKeyHashSalt.length > 0 &&
                typeof parsed.internalServiceKey === "string" &&
                parsed.internalServiceKey.length > 0
            ) {
                return {
                    apiKeyHashSalt: parsed.apiKeyHashSalt,
                    internalServiceKey: parsed.internalServiceKey,
                };
            }
        }
    } catch {
        // Corrupt/unreadable secrets file — regenerate below.
    }
    const secrets: BackendSecrets = {
        apiKeyHashSalt: randomBytes(32).toString("hex"),
        internalServiceKey: randomBytes(32).toString("hex"),
    };
    fs.mkdirSync(nodePath.dirname(opts.secretsPath), { recursive: true });
    fs.writeFileSync(opts.secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    try {
        fs.chmodSync?.(opts.secretsPath, 0o600);
    } catch {
        // chmod may fail on some filesystems (e.g. Windows) — best effort.
    }
    return secrets;
}

/**
 * Resolve the user's LOGIN-SHELL PATH. A GUI-launched macOS/Linux app inherits a
 * minimal PATH, NOT the PATH from the user's shell profile — so `which claude`
 * (and codex, pnpm, gh, …) fails even when the tool is installed via Homebrew /
 * nvm / a dotfile. We ask the login shell for its real PATH between unique
 * delimiters (so shell rc-file noise can't corrupt the value). Degrade-safe:
 * any failure (or Windows) returns '' and the caller keeps the inherited PATH.
 */
export function resolveLoginShellPath(
    deps: { platform?: string; shell?: string; execFileSync?: typeof childProcess.execFileSync } = {}
): string {
    const platform = deps.platform || process.platform;
    if (platform === "win32") {
        return "";
    }
    const shell = deps.shell || process.env.SHELL || "/bin/zsh";
    const exec = deps.execFileSync || childProcess.execFileSync;
    const D = "__RECODER_PATH_DELIM__";
    try {
        const out = String(
            exec(shell, ["-ilc", `printf %s "${D}"; printf %s "$PATH"; printf %s "${D}"`], {
                encoding: "utf8",
                timeout: 5000,
                stdio: ["ignore", "pipe", "ignore"],
            })
        );
        const parts = out.split(D);
        return parts.length >= 3 ? parts[1].trim() : "";
    } catch {
        return "";
    }
}

/**
 * Merge extra PATH entries into an env's PATH (pure — returns a new env). The
 * inherited entries stay first (an explicit override still wins); every dir the
 * login shell knows about is appended and de-duplicated, preserving order.
 */
export function mergePathIntoEnv(
    env: NodeJS.ProcessEnv,
    extraPath: string,
    sep: string = nodePath.delimiter
): NodeJS.ProcessEnv {
    if (!extraPath) {
        return env;
    }
    const current = env.PATH || env.Path || "";
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const raw of `${current}${sep}${extraPath}`.split(sep)) {
        const dir = raw.trim();
        if (dir && !seen.has(dir)) {
            seen.add(dir);
            merged.push(dir);
        }
    }
    return { ...env, PATH: merged.join(sep) };
}

/**
 * Assemble the full child-process environment for the backend. Pure: takes the
 * resolved inputs and the base env, returns a new env object (no mutation).
 */
export function assembleBackendEnv(opts: {
    baseEnv: NodeJS.ProcessEnv;
    port: number;
    dataDir: string;
    tmuxBin: string;
    apiKeyHashSalt: string;
    internalServiceKey: string;
    electronRunAsNode?: boolean;
    loginShellPath?: string;
    /** Resolved owned beads bd path (fill-only — null stays absent; see resolveBeadsBinPath). */
    beadsBin?: string;
    /** Resolved native openfang/tensorzero env (fill-only; see emain-backend-runtime-env.ts). */
    openfang?: OpenfangRuntimeEnv;
    /** Resolved embedded vector-store env (fill-only; see resolveEmbeddedVectorEnv). */
    vector?: EmbeddedVectorEnv;
    /** BYOK provider keys from the desktop secret store (fill-only; base env wins). */
    byokSecrets?: Record<string, string>;
    /** Connector addressing secrets (mem0/colbert/qdrant URLs) from the store (fill-only). */
    connectorSecrets?: Record<string, string>;
    /** Packaged cockpit static build dir the backend serves at /cockpit (fill-only). */
    cockpitDist?: string;
}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
        ...opts.baseEnv,
        PORT: String(opts.port),
        // Loopback-only bind. The backend defaults HOST to 0.0.0.0 (prod
        // containers legitimately need all-interfaces), so an embedded desktop
        // that never set HOST would expose the control-plane backend on the
        // user's LAN. The supervisor already reaches it via 127.0.0.1; pin the
        // child to loopback. An explicit operator override still wins.
        HOST: opts.baseEnv.HOST || "127.0.0.1",
        DATA_DIR: opts.dataDir,
        STRICT_AUTH: "false",
        NODE_ENV: opts.baseEnv.NODE_ENV || "production",
        API_KEY_HASH_SALT: opts.apiKeyHashSalt,
        INTERNAL_SERVICE_KEY: opts.internalServiceKey,
        // The embedded backend is one user on their own machine, so delivery
        // (merge/PR) is one-click: a user-initiated merge records its own audited
        // approval (the click IS the approval) instead of stalling on
        // awaiting_approval. Governance still classifies risk + seals the Merkle
        // audit; a hard deny still blocks.
        RECODER_SOLO_MODE: "1",
        // The default 5GB disk floor is a server-oriented guard. The embedded
        // desktop creates lightweight git worktrees for one local user, so a 2GB
        // floor is appropriate. Overridable via CONDUCTOR_MIN_FREE_DISK_GB.
        CONDUCTOR_MIN_FREE_DISK_GB: opts.baseEnv.CONDUCTOR_MIN_FREE_DISK_GB || "2",
        // tmux-path.ts resolves CONDUCTOR_TMUX_BIN (authoritative) first, then
        // RECODER_TMUX_BUILD_PATH. Set both plus TMUX_BIN for forward-compat.
        CONDUCTOR_TMUX_BIN: opts.tmuxBin,
        RECODER_TMUX_BUILD_PATH: opts.tmuxBin,
        TMUX_BIN: opts.tmuxBin,
    };
    // Shared-tmux-server invariant (durable-shell unify §A1b): TMUX_TMPDIR must
    // reach the backend UNCHANGED so the conductor's default-socket mirror
    // (`${TMUX_TMPDIR:-/tmp}/tmux-<uid>/default`, reported on /api/conductor/health)
    // and any tmux client the backend drives resolve the SAME server the Go
    // wavesrv (which inherits the same base env) uses. The `...baseEnv` spread
    // already carries it; we deliberately never override or invent it — an absent
    // TMUX_TMPDIR leaves BOTH sides defaulting to /tmp identically. This fill-only
    // guard keeps the invariant explicit if a future env-filter drops the spread.
    if (opts.baseEnv.TMUX_TMPDIR && !env.TMUX_TMPDIR) {
        env.TMUX_TMPDIR = opts.baseEnv.TMUX_TMPDIR;
    }
    // Owned beads bd, fill-only: an explicit BEADS_BIN (operator override) wins;
    // an unresolved bd stays absent so the backend degrades truthfully instead
    // of chasing a path the supervisor could not verify.
    if (opts.beadsBin && !env.BEADS_BIN) {
        env.BEADS_BIN = opts.beadsBin;
    }
    // Cockpit static dir the backend serves at /cockpit, fill-only. Packaged the
    // spawn cwd is <resources>/backend so the backend's own default
    // (../cockpit/dist) already resolves here; set it explicitly so the mount is
    // independent of cwd. An operator override still wins.
    if (opts.cockpitDist && !env.COCKPIT_DIST) {
        env.COCKPIT_DIST = opts.cockpitDist;
    }
    // BYOK provider keys from the desktop secret store, fill-only: an explicit
    // env var (operator/dev-shell override) always wins over the stored key.
    // Values never appear in logs — only names are ever logged by callers.
    for (const [name, value] of Object.entries(opts.byokSecrets ?? {})) {
        if (!env[name] && typeof value === "string" && value.trim()) {
            env[name] = value;
        }
    }
    // Native openfang/tensorzero runtime env, fill-only for the same reason.
    // The resolver already returns null for pieces the operator set explicitly
    // or that are absent on disk (truthful degrade — never a dead path).
    if (opts.openfang) {
        const fills: Array<[string, string | null]> = [
            [OPENFANG_ADDON_ENV, opts.openfang.addonPath],
            [OPENFANG_HOME_ENV, opts.openfang.homeDir],
            [OPENFANG_CONFIG_ENV, opts.openfang.configPath],
            [TENSORZERO_ADDON_ENV, opts.openfang.tensorzeroAddonPath],
        ];
        for (const [name, value] of fills) {
            if (value && !env[name]) {
                env[name] = value;
            }
        }
    }
    // Embedded vector store (Lance) addressing, fill-only + existence-gated by
    // the resolver: nativeDir makes governance + lance .node resolution explicit;
    // LANCE_DATA_DIR is set only when the lance addon is actually packaged, so an
    // absent addon leaves the backend degrading to Qdrant/no-op truthfully.
    if (opts.vector?.nativeDir) {
        if (!env[RECODER_NATIVE_DIR_ENV]) {
            env[RECODER_NATIVE_DIR_ENV] = opts.vector.nativeDir;
        }
        if (!env[LANCE_NATIVE_DIR_ENV]) {
            env[LANCE_NATIVE_DIR_ENV] = opts.vector.nativeDir;
        }
    }
    if (opts.vector?.lanceDataDir && !env[LANCE_DATA_DIR_ENV]) {
        env[LANCE_DATA_DIR_ENV] = opts.vector.lanceDataDir;
    }
    // Connector addressing secrets (mem0/colbert/qdrant URLs), fill-only: an
    // explicit env var always wins; an absent store value stays absent so the
    // backend reports the capability down instead of pointing at nothing.
    for (const [name, value] of Object.entries(opts.connectorSecrets ?? {})) {
        if (!env[name] && typeof value === "string" && value.trim()) {
            env[name] = value;
        }
    }
    // Packaged: the backend + mint scripts are spawned with process.execPath,
    // which is the Electron app binary — not plain node. ELECTRON_RUN_AS_NODE=1
    // makes it behave as a bare Node runtime so `node dist/server.js` works.
    if (opts.electronRunAsNode) {
        env.ELECTRON_RUN_AS_NODE = "1";
    }
    return mergePathIntoEnv(env, opts.loginShellPath);
}

let cachedLoginShellPath: string = null;

/**
 * Memoized resolveLoginShellPath — the login shell's PATH does not change while
 * the app runs, and probing it costs ~2s (interactive login shell spawn), so a
 * crash-restart loop must not re-pay it on every boot.
 */
export function resolveLoginShellPathCached(): string {
    if (cachedLoginShellPath == null) {
        cachedLoginShellPath = resolveLoginShellPath();
    }
    return cachedLoginShellPath;
}

export function backendUrlForPort(port: number): string {
    return `http://127.0.0.1:${port}`;
}

export function gatewayEndpointForPort(port: number): string {
    return `${backendUrlForPort(port)}/api/gateway/v1/chat/completions`;
}

export interface HealthResult {
    ok: boolean;
    attempts: number;
    elapsedMs: number;
    reason?: string;
    data?: unknown;
}

/**
 * Poll GET ${backendUrl}/api/conductor/health with the key until it returns 200
 * with a truthy success envelope, or the timeout elapses. Resolves with a
 * truthful result — { ok:false, reason } on timeout/never-ready, NEVER faked.
 */
export async function pollHealth(opts: {
    backendUrl: string;
    apiKey?: string;
    fetch: typeof fetch;
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: SleepFn;
    now?: () => number;
    isAlive?: () => boolean;
}): Promise<HealthResult> {
    const timeoutMs = opts.timeoutMs ?? 60000;
    const intervalMs = opts.intervalMs ?? 500;
    const sleep = opts.sleep || defaultSleep;
    const now = opts.now || Date.now;
    const isAlive = opts.isAlive || (() => true);
    const url = `${opts.backendUrl.replace(/\/+$/, "")}/api/conductor/health`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.apiKey) {
        // Send BOTH forms: x-api-key is the first-party platform-key path the
        // backend resolves authoritatively; Authorization Bearer is the
        // cockpit's own transport, kept consistent here.
        headers["x-api-key"] = opts.apiKey;
        headers.Authorization = `Bearer ${opts.apiKey}`;
    }

    const startedAt = now();
    let attempts = 0;
    let lastReason = "never-ready";

    while (now() - startedAt <= timeoutMs) {
        attempts += 1;
        if (!isAlive()) {
            return {
                ok: false,
                attempts,
                elapsedMs: now() - startedAt,
                reason: "backend-process-exited",
            };
        }
        try {
            const res = await opts.fetch(url, { method: "GET", headers });
            if (res && res.status === 200) {
                let data: any = null;
                try {
                    data = await res.json();
                } catch {
                    data = null;
                }
                // A 200 with success:true is the real ready signal.
                if (!data || data.success !== false) {
                    return { ok: true, attempts, elapsedMs: now() - startedAt, data };
                }
                lastReason = "health-not-success";
            } else {
                lastReason = `status-${res ? res.status : "no-response"}`;
            }
        } catch (err) {
            lastReason = err instanceof Error ? err.message : String(err);
        }
        await sleep(intervalMs);
    }

    return {
        ok: false,
        attempts,
        elapsedMs: now() - startedAt,
        reason: `timeout-after-${timeoutMs}ms (${lastReason})`,
    };
}

// ---------------------------------------------------------------------------
// Truthful engine roster (packaging truth -> runtime truth)
// ---------------------------------------------------------------------------

/** One declared engine's live liveness, named `<engineId>:<transport>`. */
export interface EngineRosterEntry {
    name: string;
    status: string;
    reason: string | null;
}

/**
 * The parsed per-engine roster from `GET /internal/engines/health`. `known` is
 * false when the roster could not be read (missing key, non-200, unparseable
 * payload, fetch error) — an UNKNOWN roster is truthful, never a fabricated
 * `alive` list. `reason` explains why it is unknown.
 */
export interface EngineRoster {
    known: boolean;
    alive: string[];
    degraded: EngineRosterEntry[];
    entries: EngineRosterEntry[];
    reason: string | null;
}

/**
 * Engines whose native/CLI artifact the packaging gate REQUIRES present (the
 * §2a arch-sensitive `.node` set plus the always-bundled beads/dmux/tmux/
 * recodergit CLIs). A `down` here is built-but-broken — a real fault worth a
 * louder line — not a deliberate cloud-or-degrade absence (mem0/colbert/…).
 */
export const PACKAGED_REQUIRED_ENGINES: ReadonlySet<string> = new Set([
    "beads:cli",
    "dmux:cli",
    "tmux:cli",
    "recodergit:cli",
    "governance:napi",
    "openfang:napi",
    "tensorzero:napi",
]);

export const INTERNAL_ENGINES_HEALTH_PATH = "/internal/engines/health";
export const INTERNAL_SERVICE_KEY_HEADER = "x-internal-service-key";

function unknownRoster(reason: string): EngineRoster {
    return { known: false, alive: [], degraded: [], entries: [], reason };
}

/** Map one raw engine reading (`{engineId,transport,status,reason?}` OR the
 * already-flattened `{name,status,reason?}`) into a roster entry, or null when
 * it is not a usable object. */
function toRosterEntry(raw: unknown): EngineRosterEntry | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const r = raw as Record<string, unknown>;
    let name: string | null = null;
    if (typeof r.name === "string" && r.name.trim()) {
        name = r.name.trim();
    } else if (typeof r.engineId === "string" && typeof r.transport === "string") {
        name = `${r.engineId}:${r.transport}`;
    }
    if (!name) {
        return null;
    }
    const status = typeof r.status === "string" && r.status.trim() ? r.status.trim() : "unknown";
    const reason = typeof r.reason === "string" && r.reason.trim() ? r.reason.trim() : null;
    return { name, status, reason };
}

function extractEnginesArray(body: unknown): unknown[] | null {
    if (!body || typeof body !== "object") {
        return null;
    }
    const b = body as Record<string, unknown>;
    const data = b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : b;
    const engines = data.engines;
    return Array.isArray(engines) ? engines : null;
}

/**
 * Parse the `/internal/engines/health` success envelope into a roster. Splits
 * engines by their OWN reported status (`up` → alive, anything else → degraded
 * carrying the endpoint's own reason) — no engine names are hardcoded, so the
 * roster always reflects what the backend actually declared. A payload with no
 * engines array is an UNKNOWN roster (truthful), never an empty-but-known one.
 */
export function parseEngineRoster(body: unknown): EngineRoster {
    const engines = extractEnginesArray(body);
    if (!engines) {
        return unknownRoster("unexpected roster payload");
    }
    const entries: EngineRosterEntry[] = [];
    for (const raw of engines) {
        const entry = toRosterEntry(raw);
        if (entry) {
            entries.push(entry);
        }
    }
    const alive = entries.filter((e) => e.status === "up").map((e) => e.name);
    const degraded = entries.filter((e) => e.status !== "up");
    return { known: true, alive, degraded, entries, reason: null };
}

/**
 * Fetch the per-engine roster from the INTERNAL_SERVICE_KEY-gated worker surface
 * `GET /internal/engines/health` (the endpoint that actually enumerates engines
 * — NOT /api/conductor/health, which only lists execution substrates). Sends the
 * `x-internal-service-key` the supervisor already mints/holds. DEGRADE-SAFE: any
 * failure (no key, non-200, unparseable body, network error) resolves to an
 * UNKNOWN roster with a truthful reason — it NEVER throws and NEVER blocks boot.
 */
export async function fetchEngineRoster(opts: {
    backendUrl: string;
    internalServiceKey?: string;
    fetch: typeof fetch;
}): Promise<EngineRoster> {
    if (!opts.internalServiceKey) {
        return unknownRoster("no internal service key");
    }
    const url = `${opts.backendUrl.replace(/\/+$/, "")}${INTERNAL_ENGINES_HEALTH_PATH}`;
    try {
        const res = await opts.fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
                [INTERNAL_SERVICE_KEY_HEADER]: opts.internalServiceKey,
            },
        });
        if (!res || res.status !== 200) {
            return unknownRoster(`status-${res ? res.status : "no-response"}`);
        }
        let body: unknown = null;
        try {
            body = await res.json();
        } catch (err) {
            return unknownRoster(err instanceof Error ? err.message : "unparseable roster body");
        }
        return parseEngineRoster(body);
    } catch (err) {
        return unknownRoster(err instanceof Error ? err.message : String(err));
    }
}

/** The embedded vector store's truthful liveness. Lance is NOT a declared engine
 * on the roster endpoint, so it is derived from packaging classification (the
 * resolver only sets LANCE_DATA_DIR when the addon is actually packaged). */
export interface VectorStoreStatus {
    lance: "alive" | "degraded";
    dataDir: string | null;
    reason: string | null;
}

export function describeVectorStore(vector: EmbeddedVectorEnv | null): VectorStoreStatus {
    const dataDir = vector?.lanceDataDir ?? null;
    if (dataDir) {
        return { lance: "alive", dataDir, reason: null };
    }
    return {
        lance: "degraded",
        dataDir: null,
        reason: "no native lance addon packaged → Qdrant/no-op",
    };
}

/**
 * Compute the next restart backoff (ms). Exponential with a cap, so a
 * crash-looping backend does not hammer the host. An optional `jitterMs` adds
 * bounded randomness to de-correlate restart storms.
 */
export function backoffMs(
    restartCount: number,
    opts: { baseMs?: number; maxMs?: number; jitterMs?: number; random?: () => number } = {}
): number {
    const base = opts.baseMs ?? 1000;
    const max = opts.maxMs ?? 30000;
    const exponential = Math.min(max, base * Math.pow(2, Math.max(0, restartCount - 1)));
    const jitterMax = opts.jitterMs ?? 0;
    if (jitterMax > 0) {
        const random = opts.random || Math.random;
        const jitter = Math.floor(random() * jitterMax);
        return Math.min(max, exponential + jitter);
    }
    return exponential;
}

/**
 * Build a clear, user-facing message explaining why the embedded backend could
 * not boot. Never claims success; always truthful.
 */
export function describeBootFailure(
    status: { phase?: string; reason?: string; restartCount?: number; logPath?: string } = {}
): string {
    const reason = status.reason || "unknown error";
    const parts = ["The local Recoder backend could not start."];
    parts.push(`Reason: ${reason}.`);
    if (typeof status.restartCount === "number" && status.restartCount > 0) {
        parts.push(`It crashed ${status.restartCount} time(s) before giving up.`);
    }
    if (status.logPath) {
        parts.push(`See the log for detail: ${status.logPath}`);
    }
    return parts.join(" ");
}

// ---------------------------------------------------------------------------
// AI-panel config writer (config-dir OVERRIDE files; never the embedded defaults)
// ---------------------------------------------------------------------------

export const RecoderAIModeName = "waveai@recoder";
const BuiltinDefaultModes = new Set(["waveai@quick", "waveai@balanced", "waveai@deep", RecoderAIModeName]);

/**
 * Write the config-dir override files that point the Wave AI panel at the
 * embedded gateway: <configDir>/waveai.json gains a `waveai@recoder` mode with
 * the live port + minted key, and <configDir>/settings.json gets
 * `waveai:defaultmode` merged in. Both writes MERGE into existing user files
 * (never clobber other keys); the default mode is only switched when the user
 * has not picked a non-builtin mode themselves. The wconfig filewatcher picks
 * up these files live, so it works whether the Go server is already up or not.
 */
export function writeWaveAIGatewayConfig(opts: {
    configDir: string;
    port: number;
    apiKey: string | null;
    fs?: FsLike;
}): { waveaiPath: string; settingsPath: string; defaultModeSet: boolean } {
    const fs: FsLike = opts.fs || (nodeFs as unknown as FsLike);
    const readJsonSafe = (p: string): Record<string, any> => {
        try {
            if (fs.existsSync(p)) {
                const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    return parsed;
                }
            }
        } catch {
            // unreadable/corrupt user file — merge onto a fresh object
        }
        return {};
    };

    fs.mkdirSync(opts.configDir, { recursive: true });

    const waveaiPath = nodePath.join(opts.configDir, "waveai.json");
    const waveai = readJsonSafe(waveaiPath);
    waveai[RecoderAIModeName] = {
        "display:name": "Recoder",
        "display:order": -4,
        "display:icon": "cube",
        "display:description": "Recoder embedded gateway (local)",
        "ai:provider": "openai",
        "ai:apitype": "openai-chat",
        "ai:endpoint": gatewayEndpointForPort(opts.port),
        "ai:model": "gpt-4o-mini",
        // With a mint failure the backend runs STRICT_AUTH=false on loopback and
        // ignores the token; a stable placeholder keeps the panel functional
        // instead of erroring on a missing OPENAI_KEY secret.
        "ai:apitoken": opts.apiKey || "recoder-local-unauthenticated",
    };
    fs.writeFileSync(waveaiPath, JSON.stringify(waveai, null, 4) + "\n", { mode: 0o600 });
    try {
        fs.chmodSync?.(waveaiPath, 0o600);
    } catch {
        // best effort — the file holds a local loopback key only
    }

    const settingsPath = nodePath.join(opts.configDir, "settings.json");
    const settings = readJsonSafe(settingsPath);
    const currentMode = settings["waveai:defaultmode"];
    const defaultModeSet = currentMode == null || BuiltinDefaultModes.has(currentMode);
    if (defaultModeSet) {
        settings["waveai:defaultmode"] = RecoderAIModeName;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4) + "\n");
    }
    return { waveaiPath, settingsPath, defaultModeSet };
}

export const CockpitWidgetKey = "defwidget@recoder-cockpit";

/**
 * Write the config-dir widgets.json override pinning the cockpit widget at the
 * LIVE backend port. The embedded default (server/pkg/wconfig/defaultconfig/
 * widgets.json) hardcodes :3100; wconfig merges the config-dir file over the
 * defaults per top-level key with the whole value replaced, so the full widget
 * object is written (not just the url). Rewritten on every onReady, it is
 * self-healing across port changes; other user-defined widgets are preserved.
 */
export function writeCockpitWidgetConfig(opts: { configDir: string; port: number; fs?: FsLike }): {
    widgetsPath: string;
} {
    const fs: FsLike = opts.fs || (nodeFs as unknown as FsLike);
    const widgetsPath = nodePath.join(opts.configDir, "widgets.json");
    let widgets: Record<string, any> = {};
    try {
        if (fs.existsSync(widgetsPath)) {
            const parsed = JSON.parse(fs.readFileSync(widgetsPath, "utf-8"));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                widgets = parsed;
            }
        }
    } catch {
        // unreadable/corrupt user file — merge onto a fresh object
    }
    fs.mkdirSync(opts.configDir, { recursive: true });
    widgets[CockpitWidgetKey] = {
        "display:order": -5.005,
        icon: "gauge-high",
        label: "cockpit",
        blockdef: {
            meta: {
                view: "web",
                url: `${backendUrlForPort(opts.port)}/cockpit/`,
            },
        },
    };
    fs.writeFileSync(widgetsPath, JSON.stringify(widgets, null, 4) + "\n");
    return { widgetsPath };
}

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

export interface SupervisorStatus {
    phase: SupervisorPhase;
    ready: boolean;
    backendUrl: string;
    port: number;
    hasApiKey: boolean;
    restartCount: number;
    error: string;
    logPath: string;
    userMessage: string;
    /** Per-engine roster from /internal/engines/health (unknown until READY). */
    engines: EngineRoster;
    /** Embedded vector store liveness (derived from packaging classification). */
    vector: VectorStoreStatus;
}

export interface BackendAuth {
    backendUrl: string;
    apiKey: string | null;
}

export interface BackendSupervisorOptions {
    userDataDir: string;
    repoRoot: string;
    isPackaged?: boolean;
    resourcesPath?: string;
    preferredPort?: number;
    // Injectable seams (tests pass fakes):
    spawn?: SpawnFn;
    fetchImpl?: typeof fetch;
    fs?: FsLike;
    pickFreePort?: () => Promise<number>;
    portIsFree?: (port: number) => Promise<boolean>;
    mintKey?: (env: NodeJS.ProcessEnv) => Promise<string>;
    resolveLoginShellPath?: () => string;
    /**
     * BYOK provider keys for the native openfang/tensorzero runtimes. The glue
     * passes a reader over the terminal's encrypted secret store (safeStorage);
     * absent ⇒ no keys are injected (dev shells still flow through baseEnv).
     * A throwing reader degrades truthfully to a keyless spawn (logged).
     */
    readByokSecrets?: () => Record<string, string>;
    /**
     * Connector addressing secrets (mem0/colbert/qdrant URLs) for the embedded
     * backend. The glue passes a reader over the same encrypted secret store as
     * BYOK, allowlisted to CONNECTOR_SECRET_ENV_NAMES. Absent ⇒ no URLs are
     * injected (the backend reports those capabilities down truthfully); a
     * throwing reader degrades to no connector env (logged), never a faked URL.
     */
    readConnectorSecrets?: () => Record<string, string>;
    log?: (level: string, message: string, extra?: object) => void;
    onReady?: (auth: { port: number; backendUrl: string; apiKey: string | null }) => void;
    healthTimeoutMs?: number;
    healthIntervalMs?: number;
    maxRestarts?: number;
    restartJitterMs?: number;
    killGraceMs?: number;
    restartWindowMs?: number;
    sleep?: SleepFn;
    now?: () => number;
}

export class BackendSupervisor {
    userDataDir: string;
    repoRoot: string;
    isPackaged: boolean;
    resourcesPath?: string;
    preferredPort?: number;

    healthTimeoutMs: number;
    healthIntervalMs: number;
    maxRestarts: number;
    restartJitterMs: number;
    killGraceMs: number;
    restartWindowMs: number;

    phase: SupervisorPhase = PHASE.IDLE;
    port: number = null;
    backendUrl: string = null;
    apiKey: string = null;
    lastError: string = null;
    restartCount = 0;
    child: ChildProcessLike = null;

    // Truthful runtime roster, surfaced on getStatus() so a dead-because-
    // unpackaged engine is VISIBLE, never hidden. Unknown until the first READY.
    _internalServiceKey: string = null;
    _engineRoster: EngineRoster = unknownRoster("not yet probed");
    _vectorEnv: EmbeddedVectorEnv = null;

    dataDir: string;
    secretsPath: string;
    logPath: string;

    _spawn: SpawnFn;
    _fetch: typeof fetch;
    _fs: FsLike;
    _pickFreePort: () => Promise<number>;
    _portIsFree: (port: number) => Promise<boolean>;
    _mintKey: (env: NodeJS.ProcessEnv) => Promise<string>;
    _readByokSecrets: () => Record<string, string>;
    _readConnectorSecrets: () => Record<string, string>;
    _resolveLoginShellPath: () => string;
    _log: (level: string, message: string, extra?: object) => void;
    _onReady?: (auth: { port: number; backendUrl: string; apiKey: string | null }) => void;
    _sleep: SleepFn;
    _now: () => number;
    _stopping = false;
    _startPromise: Promise<{ ok: boolean; backendUrl?: string; apiKey?: string | null; reason?: string }> = null;
    _childAlive = false;
    _lastReadyAt: number = null;
    _env: NodeJS.ProcessEnv = null;
    _restartTimer: ReturnType<typeof setTimeout> = null;
    _killTimer: ReturnType<typeof setTimeout> = null;

    constructor(options: BackendSupervisorOptions) {
        if (!options || !options.userDataDir || !options.repoRoot) {
            throw new Error("BackendSupervisor requires userDataDir and repoRoot");
        }
        this.userDataDir = options.userDataDir;
        this.repoRoot = options.repoRoot;
        this.isPackaged = Boolean(options.isPackaged);
        this.resourcesPath = options.resourcesPath;
        this.preferredPort = options.preferredPort;

        this._spawn = options.spawn || (childProcess.spawn as unknown as SpawnFn);
        this._fetch = options.fetchImpl || globalThis.fetch;
        this._fs = options.fs || (nodeFs as unknown as FsLike);
        this._pickFreePort = options.pickFreePort || (() => pickFreePortWithRetry({ sleep: options.sleep }));
        // Injectable so unit tests never probe a REAL port (a live backend on
        // :3100 must not change test outcomes).
        this._portIsFree = options.portIsFree || portIsFree;
        this._mintKey = options.mintKey || ((env) => this._mintKeyViaScript(env));
        this._readByokSecrets = options.readByokSecrets || (() => ({}));
        this._readConnectorSecrets = options.readConnectorSecrets || (() => ({}));
        this._resolveLoginShellPath = options.resolveLoginShellPath || resolveLoginShellPathCached;
        this._log = options.log || (() => {});
        this._onReady = options.onReady;
        this._sleep = options.sleep || defaultSleep;
        this._now = options.now || Date.now;

        this.healthTimeoutMs = options.healthTimeoutMs ?? 60000;
        this.healthIntervalMs = options.healthIntervalMs ?? 500;
        this.maxRestarts = options.maxRestarts ?? 5;
        this.restartJitterMs = options.restartJitterMs ?? 250;
        // Grace period after SIGTERM before escalating to SIGKILL so a hung
        // child can never wedge app quit.
        this.killGraceMs = options.killGraceMs ?? 5000;
        // Crashes older than this window do not count toward maxRestarts, so a
        // backend that ran healthily for a long time then crashed once gets a
        // fresh restart budget instead of being permanently failed.
        this.restartWindowMs = options.restartWindowMs ?? 60000;

        this.dataDir = nodePath.join(this.userDataDir, "backend-data");
        this.secretsPath = nodePath.join(this.userDataDir, "backend-supervisor-secrets.json");
        this.logPath = nodePath.join(this.userDataDir, "logs", "backend-supervisor.log");
    }

    /** Public, never-lies status snapshot the UI can read. */
    getStatus(): SupervisorStatus {
        const failed = this.phase === PHASE.FAILED;
        return {
            phase: this.phase,
            ready: this.phase === PHASE.READY,
            backendUrl: this.backendUrl,
            port: this.port,
            hasApiKey: Boolean(this.apiKey),
            restartCount: this.restartCount,
            error: this.lastError ? String(this.lastError) : null,
            logPath: this.logPath,
            userMessage: failed
                ? describeBootFailure({
                      phase: this.phase,
                      reason: this.lastError ? String(this.lastError) : undefined,
                      restartCount: this.restartCount,
                      logPath: this.logPath,
                  })
                : null,
            engines: this._engineRoster,
            vector: describeVectorStore(this._vectorEnv),
        };
    }

    /**
     * Auth handed to consumers. Returns null until the backend is actually
     * ready, so callers never point at a not-yet-listening backend.
     */
    getAuth(): BackendAuth {
        if (this.phase !== PHASE.READY || !this.backendUrl) {
            return null;
        }
        return { backendUrl: this.backendUrl, apiKey: this.apiKey };
    }

    _appendLog(level: string, message: string, extra?: object) {
        const line = `${new Date().toISOString()} [${level}] ${message}` + (extra ? ` ${JSON.stringify(extra)}` : "");
        this._log(level, message, extra);
        try {
            this._fs.mkdirSync(nodePath.dirname(this.logPath), { recursive: true });
            this._fs.appendFileSync(this.logPath, `${line}\n`, "utf-8");
        } catch {
            // logging must never throw
        }
    }

    /**
     * Boot the backend once: pick port, assemble env, mint key, spawn, poll
     * health. Idempotent (a concurrent call returns the in-flight promise).
     */
    async start(): Promise<{ ok: boolean; backendUrl?: string; apiKey?: string | null; reason?: string }> {
        if (this._startPromise) {
            return this._startPromise;
        }
        this._startPromise = this._startOnce().finally(() => {
            this._startPromise = null;
        });
        return this._startPromise;
    }

    async _startOnce(): Promise<{ ok: boolean; backendUrl?: string; apiKey?: string | null; reason?: string }> {
        this._stopping = false;
        this.phase = PHASE.STARTING;
        this.lastError = null;
        try {
            // Prefer the port the cockpit defaults to (3100) so default backend
            // URLs work with zero re-injection; fall back to a random free port
            // only when the preferred one is taken.
            const preferred =
                this.preferredPort ?? Number.parseInt(String(process.env.RECODER_BACKEND_PORT || "3100"), 10);
            let port: number;
            if (Number.isInteger(preferred) && preferred > 0 && (await this._portIsFree(preferred))) {
                port = preferred;
            } else {
                port = await this._pickFreePort();
            }
            const backendUrl = backendUrlForPort(port);
            const secrets = loadOrCreateSecrets({ secretsPath: this.secretsPath, fs: this._fs });
            // Hold the internal key so the READY roster probe can authenticate to
            // the INTERNAL_SERVICE_KEY-gated /internal/engines/health surface.
            this._internalServiceKey = secrets.internalServiceKey;
            const tmuxBin = resolveTmuxBin({
                isPackaged: this.isPackaged,
                repoRoot: this.repoRoot,
                resourcesPath: this.resourcesPath,
                existsSync: this._fs.existsSync,
            });
            const beadsBin = resolveBeadsBinPath({
                isPackaged: this.isPackaged,
                repoRoot: this.repoRoot,
                resourcesPath: this.resourcesPath,
                existsSync: this._fs.existsSync,
            });

            this._fs.mkdirSync(this.dataDir, { recursive: true });

            // Native openfang/tensorzero runtime env + BYOK provider keys, so
            // the backend's in-process runtime can be selected for REAL turns.
            // Both are fill-only and truthful: absent pieces stay absent (the
            // backend reports the runtime unavailable), a secret-store failure
            // degrades to a keyless spawn — never a faked value.
            const openfangEnv = resolveOpenfangRuntimeEnv({
                isPackaged: this.isPackaged,
                repoRoot: this.repoRoot,
                resourcesPath: this.resourcesPath,
                dataDir: this.dataDir,
                baseEnv: process.env,
                existsSync: this._fs.existsSync,
            });
            let byokSecrets: Record<string, string> = {};
            try {
                byokSecrets = this._readByokSecrets();
            } catch (err) {
                this._appendLog("warn", "BYOK secret read failed; native runtimes spawn keyless", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            // Embedded vector store (Lance) addressing + connector URLs. Both are
            // fill-only and truthful: an absent lance addon leaves LANCE_DATA_DIR
            // unset (backend degrades to Qdrant/no-op); an unconfigured connector
            // URL stays absent (that capability reports down) — never a faked URL.
            const vectorEnv = resolveEmbeddedVectorEnv({
                isPackaged: this.isPackaged,
                resourcesPath: this.resourcesPath,
                dataDir: this.dataDir,
                baseEnv: process.env,
                existsSync: this._fs.existsSync,
            });
            this._vectorEnv = vectorEnv;
            let connectorSecrets: Record<string, string> = {};
            try {
                connectorSecrets = this._readConnectorSecrets();
            } catch (err) {
                this._appendLog("warn", "connector secret read failed; connectors report down", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            this._appendLog("info", "native runtime env resolved", {
                openfangAddon: Boolean(openfangEnv.addonPath || process.env.OPENFANG_NATIVE_ADDON),
                tensorzeroAddon: Boolean(openfangEnv.tensorzeroAddonPath || process.env.TENSORZERO_GATEWAY_NAPI_NODE),
                openfangHome: openfangEnv.homeDir || process.env.OPENFANG_HOME || null,
                lanceDataDir: vectorEnv.lanceDataDir || null,
                // Names only — key/URL VALUES must never reach the log.
                byokKeys: Object.keys(byokSecrets),
                connectorKeys: Object.keys(connectorSecrets),
            });

            const env = assembleBackendEnv({
                baseEnv: process.env,
                port,
                dataDir: this.dataDir,
                tmuxBin,
                apiKeyHashSalt: secrets.apiKeyHashSalt,
                internalServiceKey: secrets.internalServiceKey,
                // Packaged spawns use process.execPath (the Electron binary);
                // run it as node.
                electronRunAsNode: this.isPackaged,
                // Give the backend the user's real login-shell PATH so it can
                // detect the agent CLIs (claude/codex/…) a GUI launch would
                // otherwise not see.
                loginShellPath: this._resolveLoginShellPath(),
                beadsBin,
                openfang: openfangEnv,
                vector: vectorEnv,
                byokSecrets,
                connectorSecrets,
                cockpitDist:
                    this.isPackaged && this.resourcesPath
                        ? nodePath.join(this.resourcesPath, "cockpit", "dist")
                        : undefined,
            });

            this.port = port;
            this.backendUrl = backendUrl;
            this._env = env;

            this._appendLog("info", "minting local conductor key", { dataDir: this.dataDir });
            let apiKey: string = null;
            try {
                apiKey = await this._mintKey(env);
            } catch (err) {
                // A mint failure is non-fatal: with STRICT_AUTH=false on
                // loopback the backend still serves. Surface it truthfully.
                this._appendLog("warn", "conductor key mint failed; continuing without a key", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            this.apiKey = apiKey;

            // Fail-closed ONLY when the minted key is actually enforceable. The
            // greenfield backend validates sk_ keys through the DB-backed
            // ApiKeyService; without a DATABASE_URL (the embedded desktop
            // default) that store is empty, so a minted key can NEVER
            // authenticate — forcing STRICT_AUTH would 401 every route and brick
            // the app. In that case we stay on the documented permissive
            // loopback posture (STRICT_AUTH=false; single local user, loopback
            // bind, RECODER_SOLO_MODE). When a durable store IS configured the
            // key is required, so it is never decorative. Follow-up: a DB-less
            // durable key store so the desktop can be strict too.
            const keyIsEnforceable = Boolean(apiKey && env.DATABASE_URL);
            const spawnEnv = keyIsEnforceable ? { ...env, STRICT_AUTH: "true" } : env;
            this._env = spawnEnv;

            this._appendLog("info", "spawning backend child", {
                backendUrl,
                tmuxBin,
                beadsBin,
                strictAuth: spawnEnv.STRICT_AUTH,
            });
            this._spawnChild(spawnEnv);

            const health = await pollHealth({
                backendUrl,
                apiKey: this.apiKey || undefined,
                fetch: this._fetch,
                timeoutMs: this.healthTimeoutMs,
                intervalMs: this.healthIntervalMs,
                sleep: this._sleep,
                now: this._now,
                isAlive: () => Boolean(this.child) && this.child.killed !== true && this._childAlive,
            });

            if (!health.ok) {
                this.phase = PHASE.FAILED;
                this.lastError = `backend health check failed: ${health.reason}`;
                this._appendLog("error", this.lastError, { attempts: health.attempts });
                this._killChild();
                return { ok: false, reason: this.lastError };
            }

            this.phase = PHASE.READY;
            // Forgive the restart budget ONLY once the backend has proven it can
            // stay up for a full restart window. Zeroing on every READY lets a
            // boot that health-passes then crashes seconds later restart forever
            // (a storm that never surfaces FAILED). _lastReadyAt still holds the
            // PREVIOUS ready timestamp here, so this measures how long the last
            // session actually lived before it died.
            const readyAt = this._now();
            if (
                this._lastReadyAt != null &&
                this.restartWindowMs > 0 &&
                readyAt - this._lastReadyAt >= this.restartWindowMs
            ) {
                this.restartCount = 0;
            }
            this._lastReadyAt = readyAt;
            this._appendLog("info", "backend ready", {
                backendUrl,
                attempts: health.attempts,
                elapsedMs: health.elapsedMs,
            });
            // Only advertise the gateway once it is actually serving — the
            // onReady hook (AI-panel config write) must never point at a
            // backend that failed its health gate.
            try {
                this._onReady?.({ port, backendUrl, apiKey: this.apiKey });
            } catch (err) {
                this._appendLog("warn", "onReady hook failed", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            // Truthful engine roster: surface which engines are alive vs
            // dead-because-unpackaged. Degrade-safe — an unreachable roster
            // resolves to UNKNOWN (never throws, never blocks this boot).
            await this._refreshEngineRoster();
            return { ok: true, backendUrl, apiKey: this.apiKey };
        } catch (err) {
            this.phase = PHASE.FAILED;
            this.lastError = err instanceof Error ? err.message : String(err);
            this._appendLog("error", "backend start failed", { error: this.lastError });
            this._killChild();
            return { ok: false, reason: this.lastError };
        }
    }

    /**
     * Probe /internal/engines/health and write a truthful alive/degraded roster
     * to the log + the status object. Never throws (fetchEngineRoster is
     * degrade-safe) and never blocks boot: an unreachable roster stays UNKNOWN.
     * Lance is rendered from packaging classification since it is NOT a declared
     * engine on the endpoint; a PACKAGED-required engine reporting `down` is
     * built-but-broken and gets a louder line than a deliberate absence.
     */
    async _refreshEngineRoster(): Promise<void> {
        const roster = await fetchEngineRoster({
            backendUrl: this.backendUrl,
            internalServiceKey: this._internalServiceKey || undefined,
            fetch: this._fetch,
        });
        this._engineRoster = roster;

        const vector = describeVectorStore(this._vectorEnv);
        if (!roster.known) {
            this._appendLog("warn", "engine roster unavailable", {
                reason: roster.reason,
                lance: vector.lance,
            });
            return;
        }

        this._appendLog("info", "engine roster", {
            alive: roster.alive,
            degraded: roster.degraded.map((e) => (e.reason ? `${e.name} (${e.reason})` : e.name)),
            lance: vector.lance === "alive" ? vector.dataDir : vector.reason,
        });

        // Reconcile packaging truth with runtime truth: a PACKAGED-required
        // engine reporting `down` is built-but-broken (a real fault), not the
        // deliberate cloud-or-degrade absence of an un-packaged sidecar.
        const brokenRequired = roster.degraded.filter((e) => PACKAGED_REQUIRED_ENGINES.has(e.name));
        if (brokenRequired.length) {
            this._appendLog("error", "packaged engine(s) reporting down (built-but-broken)", {
                engines: brokenRequired.map((e) => (e.reason ? `${e.name} (${e.reason})` : e.name)),
            });
        }
    }

    /** Spawn the backend child and wire crash handling. */
    _spawnChild(env: NodeJS.ProcessEnv) {
        const { command, args, cwd } = this._resolveSpawnTarget();
        this._appendLog("info", "spawn target", { command, args, cwd });
        const child = this._spawn(command, args, {
            cwd,
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        this.child = child;
        this._childAlive = true;

        if (child.stdout && typeof child.stdout.on === "function") {
            child.stdout.on("data", (buf: unknown) => {
                this._appendLog("backend", String(buf).trimEnd());
            });
        }
        if (child.stderr && typeof child.stderr.on === "function") {
            child.stderr.on("data", (buf: unknown) => {
                this._appendLog("backend-err", String(buf).trimEnd());
            });
        }

        child.on("exit", (code: number, signal: string) => {
            this._childAlive = false;
            this._onChildExit(code, signal);
        });
        child.on("error", (err: unknown) => {
            this._childAlive = false;
            this.lastError = err instanceof Error ? err.message : String(err);
            this._appendLog("error", "backend spawn error", { error: this.lastError });
        });
    }

    /**
     * Decide what to exec. Dev: tsx src/server.ts from backend in the repo.
     * Packaged: electron-as-node with tsx's in-process loader running
     * <resourcesPath>/backend/dist/server.js.
     *
     * The compiled backend (dist/server.js) require()s ~40 workspace
     * @recoder/* packages that ship TypeScript source (their package.json
     * main/exports point at src/*.ts, with no JS build), so a plain
     * `node dist/server.js` dies with ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
     * on the first such require. tsx's `--import` loader transpiles those .ts
     * deps on demand — the exact runtime dev already uses. tsx and every
     * workspace source ship inside the bundled backend/node_modules (a
     * self-contained pnpm deploy), and cwd=backendDir so `tsx` resolves there.
     */
    _resolveSpawnTarget(): { command: string; args: string[]; cwd: string } {
        if (this.isPackaged && this.resourcesPath) {
            const backendDir = nodePath.join(this.resourcesPath, "backend");
            return {
                command: process.execPath,
                args: ["--import", "tsx", nodePath.join(backendDir, "dist", "server.js")],
                cwd: backendDir,
            };
        }
        const backendDir = nodePath.join(this.repoRoot, "backend");
        const tsxBin = nodePath.join(backendDir, "node_modules", ".bin", "tsx");
        return {
            command: tsxBin,
            args: [nodePath.join(backendDir, "src", "server.ts")],
            cwd: backendDir,
        };
    }

    /**
     * Mint a platform sk_ key by running the real mint script with the SAME
     * salt + DATA_DIR the server uses. Resolves with the plaintext key (the
     * script's last stdout JSON line carries { apiKey }).
     */
    _mintKeyViaScript(env: NodeJS.ProcessEnv): Promise<string> {
        return new Promise((resolve, reject) => {
            const backendDir =
                this.isPackaged && this.resourcesPath
                    ? nodePath.join(this.resourcesPath, "backend")
                    : nodePath.join(this.repoRoot, "backend");

            let command: string;
            let args: string[];
            if (this.isPackaged && this.resourcesPath) {
                // Packaged: run the compiled mint entrypoint with bundled node.
                // It lives under src/conductor so tsc compiles it to
                // dist/conductor (scripts/ is outside rootDir, not emitted).
                command = process.execPath;
                args = [nodePath.join(backendDir, "dist", "conductor", "mint-conductor-key.js")];
            } else {
                command = nodePath.join(backendDir, "node_modules", ".bin", "tsx");
                args = [nodePath.join(backendDir, "scripts", "dev-mint-conductor-key.ts")];
            }

            const proc = this._spawn(command, args, {
                cwd: backendDir,
                env, // shares API_KEY_HASH_SALT + DATA_DIR with the server
                stdio: ["ignore", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            proc.stdout?.on("data", (b: unknown) => {
                stdout += String(b);
            });
            proc.stderr?.on("data", (b: unknown) => {
                stderr += String(b);
            });
            proc.on("error", reject);
            proc.on("exit", (code: number) => {
                if (code !== 0) {
                    reject(new Error(`mint script exited ${code}: ${stderr.trim() || "no stderr"}`));
                    return;
                }
                const lines = stdout.trim().split("\n").filter(Boolean);
                for (let i = lines.length - 1; i >= 0; i -= 1) {
                    try {
                        const parsed = JSON.parse(lines[i]);
                        if (parsed && typeof parsed.apiKey === "string" && parsed.apiKey.startsWith("sk_")) {
                            resolve(parsed.apiKey);
                            return;
                        }
                    } catch {
                        // not the JSON line; keep scanning upward
                    }
                }
                reject(new Error("mint script produced no apiKey line on stdout"));
            });
        });
    }

    /** Handle child exit: restart with backoff unless we are intentionally stopping. */
    _onChildExit(code: number, signal: string) {
        if (this._stopping || this.phase === PHASE.STOPPED) {
            this.phase = PHASE.STOPPED;
            this._appendLog("info", "backend stopped", { code, signal });
            return;
        }
        this.phase = PHASE.CRASHED;
        this.lastError = `backend exited (code=${code}, signal=${signal})`;
        this._appendLog("error", this.lastError, { restartCount: this.restartCount });

        // If the backend ran healthily for longer than the restart window
        // before this crash, forgive the prior crash budget — a long-lived
        // backend that dies once should be restarted, not permanently failed.
        if (
            this._lastReadyAt != null &&
            this.restartWindowMs > 0 &&
            this._now() - this._lastReadyAt >= this.restartWindowMs &&
            this.restartCount > 0
        ) {
            this._appendLog("info", "crash after a long healthy run; resetting restart budget", {
                healthyForMs: this._now() - this._lastReadyAt,
            });
            this.restartCount = 0;
        }

        if (this.restartCount >= this.maxRestarts) {
            this.phase = PHASE.FAILED;
            this.lastError = `backend crashed ${this.restartCount} times; giving up`;
            this._appendLog("error", this.lastError);
            return;
        }

        this.restartCount += 1;
        const delay = backoffMs(this.restartCount, { jitterMs: this.restartJitterMs });
        this._appendLog("warn", "scheduling backend restart", { delay, attempt: this.restartCount });
        this._restartTimer = setTimeout(() => {
            if (this._stopping) {
                return;
            }
            void this._startOnce();
        }, delay);
        if (this._restartTimer && typeof this._restartTimer.unref === "function") {
            this._restartTimer.unref();
        }
    }

    _killChild() {
        if (this._restartTimer) {
            clearTimeout(this._restartTimer);
            this._restartTimer = null;
        }
        if (this._killTimer) {
            clearTimeout(this._killTimer);
            this._killTimer = null;
        }
        const child = this.child;
        this.child = null;
        this._childAlive = false;
        if (!child || typeof child.kill !== "function") {
            return;
        }
        // Clean shutdown: SIGTERM first so the backend can flush and release
        // tmux/sockets; escalate to SIGKILL after the grace period so a hung
        // child can never wedge app quit.
        try {
            child.kill("SIGTERM");
        } catch {
            return;
        }
        if (this.killGraceMs > 0 && child.killed !== true) {
            this._killTimer = setTimeout(() => {
                this._killTimer = null;
                try {
                    // child.killed flips true once the process actually exits;
                    // only escalate if it is still around.
                    if (child.killed !== true && child.exitCode == null) {
                        child.kill("SIGKILL");
                    }
                } catch {
                    // already gone
                }
            }, this.killGraceMs);
            if (this._killTimer && typeof this._killTimer.unref === "function") {
                this._killTimer.unref();
            }
        }
    }

    /**
     * A clear, user-facing failure message when the backend could not boot, or
     * null when it is healthy / still starting. Truthful — never invents success.
     */
    getUserFacingError(): string {
        if (this.phase !== PHASE.FAILED) {
            return null;
        }
        return describeBootFailure({
            phase: this.phase,
            reason: this.lastError ? String(this.lastError) : undefined,
            restartCount: this.restartCount,
            logPath: this.logPath,
        });
    }

    /** Stop the backend and prevent restart. Called on app quit. */
    async stop() {
        this._stopping = true;
        this.phase = PHASE.STOPPED;
        this._killChild();
        this._appendLog("info", "supervisor stopped");
    }
}
