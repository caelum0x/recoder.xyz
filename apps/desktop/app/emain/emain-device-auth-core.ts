// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Desktop device-flow sign-in (RFC 8628) against recoder.xyz — the main-process
 * implementation behind the Wave-frontend `recoder:sign-in` / `get-identity` /
 * `sign-out` bridge (emain-ipc.ts handlers, exposed through preload.ts).
 *
 * Flow: POST /api/auth/cli/device -> open the system browser on the
 * verification page -> poll POST /api/auth/cli/token (device_code grant) until
 * the user approves -> persist { accessToken, refreshToken, identity }
 * encrypted (Electron safeStorage) in userData -> report { ok, identity }.
 *
 * The recoder.xyz session is captured MAIN-PROCESS-SIDE only: the result hands
 * the renderer the display identity, NOT the token — recoder.xyz remains the
 * auth source of truth for the user's account/plan. Nothing here fabricates a
 * session: every non-approved path resolves { ok: false, reason }.
 *
 * This module has NO electron imports so it can be unit-tested with fakes
 * (see emain-device-auth-core.test.ts). The electron glue (safeStorage
 * encryption, userData path, shell.openExternal) lives in emain-device-auth.ts.
 */

import * as nodeFs from "fs";
import * as nodeOs from "os";
import * as nodePath from "path";

export interface DeviceIdentity {
    name?: string;
    email?: string;
    plan?: string;
    avatarUrl?: string;
}

export interface DeviceAuthResult {
    ok: boolean;
    reason?: string;
    identity?: DeviceIdentity;
}

export interface DeviceLoginPrompt {
    userCode: string;
    verificationUri: string;
    verificationUriComplete?: string;
    expiresIn: number;
}

interface StoredDeviceSession {
    accessToken: string;
    refreshToken?: string;
    identity?: DeviceIdentity;
    /** Epoch ms the access token expires (from the grant's expires_in). */
    expiresAt?: number;
}

export interface DeviceAuthDeps {
    /** recoder.xyz origin (override for staging/e2e). */
    baseUrl?: string;
    /**
     * Non-secret, human-recognizable label for THIS device, sent at device-flow
     * init so /account can show which device each session is. Defaults to
     * os.hostname()+platform; injectable for tests. NEVER a fingerprint or secret.
     */
    deviceLabel?: string;
    /** Where the encrypted session file lives (userData). */
    sessionPath: string;
    /** Encrypt/decrypt for the persisted session (glue passes safeStorage). */
    encrypt: (plaintext: string) => string;
    decrypt: (ciphertext: string) => string;
    fetchFn?: typeof fetch;
    openExternal?: (url: string) => Promise<void>;
    fs?: Pick<typeof nodeFs, "existsSync" | "readFileSync" | "writeFileSync" | "mkdirSync" | "rmSync">;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}

export const DefaultAuthBaseUrl = "https://recoder.xyz";
const ClientId = "recoder-desktop";
const DefaultPollIntervalMs = 5000;
const MaxPollIntervalMs = 15000;

/**
 * Only URLs on the configured auth origin may be handed to the OS opener. The
 * device-flow response is remote input: accepting an arbitrary https origin
 * would turn sign-in into a phishing redirect even though custom schemes were
 * already rejected.
 */
function isTrustedVerificationUrl(raw: string | undefined | null, authBaseUrl: string): boolean {
    if (!raw) return false;
    try {
        const candidate = new URL(raw);
        const authOrigin = new URL(authBaseUrl).origin;
        return candidate.origin === authOrigin && (candidate.protocol === "https:" || candidate.protocol === "http:");
    } catch {
        return false;
    }
}
/** Refresh this far before the stored token actually expires. */
export const SessionRefreshSkewMs = 5 * 60 * 1000;

/**
 * A stable, non-secret label for this device: hostname + platform (e.g.
 * "my-macbook (darwin)"). NOT a fingerprint — just enough for the user to
 * recognize which device a session belongs to on /account.
 */
export function defaultDeviceLabel(os: Pick<typeof nodeOs, "hostname" | "platform"> = nodeOs): string {
    let host = "";
    try {
        host = (os.hostname() || "").trim();
    } catch {
        // Some sandboxes deny hostname(); the platform alone is still useful.
    }
    const platform = os.platform();
    return host ? `${host} (${platform})` : platform;
}

export function identityFromUser(user: unknown): DeviceIdentity | undefined {
    if (user == null || typeof user !== "object") {
        return undefined;
    }
    const u = user as Record<string, unknown>;
    const identity: DeviceIdentity = {};
    if (typeof u.name === "string" && u.name) {
        identity.name = u.name;
    }
    if (typeof u.email === "string" && u.email) {
        identity.email = u.email;
    }
    if (typeof u.plan === "string" && u.plan) {
        identity.plan = u.plan;
    }
    // Better Auth's standard profile field is `image`; some payloads carry
    // `avatarUrl`. Accept either so an OAuth user's picture reaches the header.
    const avatar =
        typeof u.avatarUrl === "string" && u.avatarUrl
            ? u.avatarUrl
            : typeof u.image === "string" && u.image
              ? u.image
              : "";
    if (avatar) {
        identity.avatarUrl = avatar;
    }
    return Object.keys(identity).length > 0 ? identity : undefined;
}

export class DeviceAuthManager {
    private baseUrl: string;
    private deviceLabel: string;
    private sessionPath: string;
    private fetchFn: typeof fetch;
    private openExternal: (url: string) => Promise<void>;
    private fs: NonNullable<DeviceAuthDeps["fs"]>;
    private encrypt: (plaintext: string) => string;
    private decrypt: (ciphertext: string) => string;
    private sleep: (ms: number) => Promise<void>;
    private now: () => number;
    private session: StoredDeviceSession | null = null;
    private sessionLoaded = false;

    constructor(deps: DeviceAuthDeps) {
        this.baseUrl = (deps.baseUrl || DefaultAuthBaseUrl).replace(/\/+$/, "");
        this.deviceLabel = deps.deviceLabel || defaultDeviceLabel();
        this.sessionPath = deps.sessionPath;
        this.fetchFn = deps.fetchFn || fetch;
        this.openExternal = deps.openExternal || (async () => {});
        this.fs = deps.fs || nodeFs;
        this.encrypt = deps.encrypt;
        this.decrypt = deps.decrypt;
        this.sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
        this.now = deps.now || Date.now;
    }

    /** The stored display identity, or null. Loads (and decrypts) lazily once. */
    getIdentity(): DeviceIdentity | null {
        return this.loadSession()?.identity ?? null;
    }

    /** Whether a captured session exists on disk (identity may still be absent). */
    hasSession(): boolean {
        return this.loadSession() != null;
    }

    /**
     * Drive the full device sign-in. `onPrompt` fires once the server issued the
     * user code (the renderer shows it); the browser is opened for the user.
     */
    async deviceLogin(onPrompt?: (prompt: DeviceLoginPrompt) => void): Promise<DeviceAuthResult> {
        let start: {
            device_code?: string;
            user_code?: string;
            verification_uri?: string;
            verification_uri_complete?: string;
            expires_in?: number;
            interval?: number;
        };
        try {
            start = await this.postJson("/api/auth/cli/device", {
                client_id: ClientId,
                device_label: this.deviceLabel,
            });
        } catch (e) {
            return { ok: false, reason: `network: ${e instanceof Error ? e.message : String(e)}` };
        }
        if (!start?.device_code || !start.user_code) {
            return { ok: false, reason: "device authorization unavailable" };
        }

        const expiresIn = typeof start.expires_in === "number" ? start.expires_in : 600;
        const fallbackVerificationUri = `${this.baseUrl}/cli/auth`;
        const verificationUri = isTrustedVerificationUrl(start.verification_uri, this.baseUrl)
            ? start.verification_uri!
            : fallbackVerificationUri;
        const verificationUriComplete = isTrustedVerificationUrl(start.verification_uri_complete, this.baseUrl)
            ? start.verification_uri_complete
            : undefined;
        onPrompt?.({
            userCode: start.user_code,
            verificationUri,
            verificationUriComplete,
            expiresIn,
        });
        // SECURITY (recoder-o896): open only the sanitized same-origin target.
        // Invalid, custom-scheme, and cross-origin values all degrade to the
        // configured Recoder auth page, where the displayed user code can be
        // entered manually.
        const openTarget = verificationUriComplete || verificationUri;
        try {
            await this.openExternal(openTarget);
        } catch {
            // The prompt still shows the trusted URI + code for manual entry.
        }

        let intervalMs =
            typeof start.interval === "number" && start.interval > 0
                ? start.interval * 1000
                : DefaultPollIntervalMs;
        const deadline = this.now() + expiresIn * 1000;

        while (this.now() < deadline) {
            await this.sleep(intervalMs);
            let res: Response;
            try {
                res = await this.fetchFn(`${this.baseUrl}/api/auth/cli/token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                        device_code: start.device_code,
                        client_id: ClientId,
                    }),
                });
            } catch {
                // Transient network failure mid-poll — keep polling until expiry.
                continue;
            }
            const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (res.ok && typeof body?.access_token === "string") {
                const session: StoredDeviceSession = {
                    accessToken: body.access_token,
                    ...(typeof body.refresh_token === "string" ? { refreshToken: body.refresh_token } : {}),
                    ...(identityFromUser(body.user) ? { identity: identityFromUser(body.user) } : {}),
                    ...(typeof body.expires_in === "number"
                        ? { expiresAt: this.now() + body.expires_in * 1000 }
                        : {}),
                };
                this.persistSession(session);
                return { ok: true, identity: session.identity };
            }
            const error = typeof body?.error === "string" ? body.error : "";
            if (error === "authorization_pending" || body?.status === "pending") {
                continue;
            }
            if (error === "slow_down") {
                intervalMs = Math.min(intervalMs + 5000, MaxPollIntervalMs);
                continue;
            }
            if (error === "access_denied" || /denied/i.test(String(body?.error_description ?? ""))) {
                return { ok: false, reason: "denied" };
            }
            if (error === "expired_token" || /expired/i.test(String(body?.error_description ?? ""))) {
                return { ok: false, reason: "expired" };
            }
            // Unknown terminal rejection — truthful failure, never retried forever.
            return {
                ok: false,
                reason:
                    typeof body?.error_description === "string"
                        ? body.error_description
                        : error || `sign-in failed (http ${res.status})`,
            };
        }
        return { ok: false, reason: "expired" };
    }

    /** Refresh the stored session via the refresh_token grant. */
    async refresh(): Promise<DeviceAuthResult> {
        const session = this.loadSession();
        if (!session?.refreshToken) {
            return { ok: false, reason: "no stored refresh token" };
        }
        let body: Record<string, unknown> | null;
        try {
            const res = await this.fetchFn(`${this.baseUrl}/api/auth/cli/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    grant_type: "refresh_token",
                    refresh_token: session.refreshToken,
                    client_id: ClientId,
                }),
            });
            body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            if (!res.ok || typeof body?.access_token !== "string") {
                return {
                    ok: false,
                    reason: typeof body?.error === "string" ? body.error : `refresh failed (http ${res.status})`,
                };
            }
        } catch (e) {
            return { ok: false, reason: `network: ${e instanceof Error ? e.message : String(e)}` };
        }
        const identity = identityFromUser(body.user) ?? session.identity;
        const next: StoredDeviceSession = {
            accessToken: body.access_token as string,
            refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : session.refreshToken,
            ...(identity ? { identity } : {}),
            ...(typeof body.expires_in === "number" ? { expiresAt: this.now() + body.expires_in * 1000 } : {}),
        };
        this.persistSession(next);
        return { ok: true, identity: next.identity };
    }

    /**
     * Return the current identity, refreshing FIRST when the stored token is at
     * (or within skew of) its expiry. A legacy session with no expiresAt is left
     * as-is so it never loop-refreshes; a refresh failure degrades to the stored
     * identity with ok:false rather than throwing.
     */
    async ensureFreshSession(): Promise<DeviceAuthResult> {
        const session = this.loadSession();
        if (session == null) {
            return { ok: false, reason: "no stored session" };
        }
        if (session.expiresAt == null || this.now() < session.expiresAt - SessionRefreshSkewMs) {
            return { ok: true, identity: session.identity };
        }
        const result = await this.refresh();
        if (result.ok) {
            return result;
        }
        return { ok: false, reason: result.reason, identity: session.identity };
    }

    /** Clear the stored session. Best-effort — always leaves us signed out. */
    signOut(): { ok: boolean } {
        this.session = null;
        this.sessionLoaded = true;
        try {
            this.fs.rmSync(this.sessionPath, { force: true });
        } catch {
            // File may be gone/undeletable; in-memory session is already cleared.
        }
        return { ok: true };
    }

    private loadSession(): StoredDeviceSession | null {
        if (this.sessionLoaded) {
            return this.session;
        }
        this.sessionLoaded = true;
        try {
            if (!this.fs.existsSync(this.sessionPath)) {
                return null;
            }
            const raw = this.fs.readFileSync(this.sessionPath, "utf-8");
            const parsed = JSON.parse(this.decrypt(JSON.parse(raw).ciphertext));
            if (parsed && typeof parsed.accessToken === "string" && parsed.accessToken) {
                this.session = parsed as StoredDeviceSession;
            }
        } catch {
            // Corrupt/undecryptable session — treat as signed out (re-login heals).
            this.session = null;
        }
        return this.session;
    }

    private persistSession(session: StoredDeviceSession): void {
        this.session = session;
        this.sessionLoaded = true;
        try {
            this.fs.mkdirSync(nodePath.dirname(this.sessionPath), { recursive: true });
            this.fs.writeFileSync(
                this.sessionPath,
                JSON.stringify({ ciphertext: this.encrypt(JSON.stringify(session)) }),
                { mode: 0o600 }
            );
        } catch (e) {
            // The in-memory session still works this run; persistence is best-effort.
            console.log("device session persist failed", e);
        }
    }

    private async postJson<T>(path: string, body: unknown): Promise<T> {
        const res = await this.fetchFn(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            throw new Error(`POST ${path} failed (http ${res.status})`);
        }
        return (await res.json()) as T;
    }
}
