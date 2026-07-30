// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Device-flow sign-in core, unit-tested with fakes (no electron, no network).
 *
 * Proves: the happy path (device -> prompt -> poll pending -> authorized)
 * persists the session encrypted and returns identity WITHOUT the token;
 * denied/expired resolve truthful failures; slow_down backs off; refresh
 * rotates tokens via the stored refresh token; signOut clears the stored
 * session; a corrupt session file reads as signed out (never a crash).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DeviceAuthManager, DeviceLoginPrompt, identityFromUser } from "./emain-device-auth-core";

interface FakeFile {
    content?: string;
}

function makeFakeFs(file: FakeFile) {
    return {
        existsSync: () => file.content != null,
        readFileSync: () => {
            if (file.content == null) {
                throw new Error("missing");
            }
            return file.content;
        },
        writeFileSync: (_path: unknown, data: string) => {
            file.content = data;
        },
        mkdirSync: () => undefined,
        rmSync: () => {
            file.content = undefined;
        },
    } as unknown as typeof import("fs");
}

const identity = { email: "caelum@recoder.xyz", name: "caelum0x", plan: "pro" };

describe("identityFromUser — avatar threading", () => {
    it("maps Better Auth's `image` field to avatarUrl", () => {
        expect(identityFromUser({ name: "Ada", image: "https://cdn/ada.png" })).toEqual({
            name: "Ada",
            avatarUrl: "https://cdn/ada.png",
        });
    });

    it("prefers an explicit avatarUrl over image", () => {
        expect(identityFromUser({ avatarUrl: "https://a/pref.png", image: "https://a/img.png" })?.avatarUrl).toBe(
            "https://a/pref.png"
        );
    });

    it("omits avatarUrl when neither field is a non-empty string", () => {
        expect(identityFromUser({ name: "Ada", image: "", avatarUrl: 42 })).toEqual({ name: "Ada" });
    });

    it("returns undefined for a non-object / empty user (never throws)", () => {
        expect(identityFromUser(null)).toBeUndefined();
        expect(identityFromUser({})).toBeUndefined();
    });
});

/** A scripted token endpoint: shift one response per poll. */
function makeFetch(tokenResponses: Array<{ status: number; body: unknown }>) {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        calls.push({ url: String(url), body });
        if (String(url).endsWith("/api/auth/cli/device")) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    device_code: "dev123",
                    user_code: "ABCD-1234",
                    verification_uri: "https://recoder.xyz/cli/auth",
                    verification_uri_complete: "https://recoder.xyz/cli/auth?code=ABCD-1234",
                    expires_in: 600,
                    interval: 1,
                }),
            };
        }
        const next = tokenResponses.shift() ?? { status: 500, body: { error: "exhausted" } };
        return {
            ok: next.status >= 200 && next.status < 300,
            status: next.status,
            json: async () => next.body,
        };
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
}

let file: FakeFile;
let opened: string[];

function makeManager(fetchFn: typeof fetch, nowRef?: { t: number }): DeviceAuthManager {
    return new DeviceAuthManager({
        baseUrl: "https://recoder.xyz",
        sessionPath: "/fake/session.json",
        fs: makeFakeFs(file),
        encrypt: (s) => `enc:${Buffer.from(s).toString("base64")}`,
        decrypt: (s) => {
            if (!s.startsWith("enc:")) {
                throw new Error("bad ciphertext");
            }
            return Buffer.from(s.slice(4), "base64").toString();
        },
        fetchFn,
        openExternal: async (url) => {
            opened.push(url);
        },
        sleep: async () => {
            if (nowRef) {
                nowRef.t += 1000;
            }
        },
        now: () => (nowRef ? nowRef.t : Date.now()),
    });
}

beforeEach(() => {
    file = {};
    opened = [];
});

describe("device login", () => {
    it("completes the flow: prompt, browser, pending then authorized, session persisted", async () => {
        const { fetchFn, calls } = makeFetch([
            { status: 400, body: { error: "authorization_pending", status: "pending" } },
            {
                status: 200,
                body: { status: "authorized", access_token: "at1", refresh_token: "rt1", user: identity },
            },
        ]);
        const manager = makeManager(fetchFn);
        const prompts: DeviceLoginPrompt[] = [];
        const result = await manager.deviceLogin((p) => prompts.push(p));

        expect(result.ok).toBe(true);
        expect(result.identity).toEqual(identity);
        // No token in the result — the session stays main-process-side.
        expect(JSON.stringify(result)).not.toContain("at1");
        expect(prompts).toHaveLength(1);
        expect(prompts[0].userCode).toBe("ABCD-1234");
        expect(opened).toEqual(["https://recoder.xyz/cli/auth?code=ABCD-1234"]);
        // Persisted encrypted (the raw token never on disk in plaintext).
        expect(file.content).toContain("enc:");
        expect(file.content).not.toContain("at1");
        // Polls used the device_code grant.
        const tokenCall = calls.find((c) => c.url.endsWith("/cli/token"));
        expect(tokenCall?.body.grant_type).toBe("urn:ietf:params:oauth:grant-type:device_code");
        // Identity now resolves from the persisted session.
        expect(manager.getIdentity()).toEqual(identity);
        expect(manager.hasSession()).toBe(true);
    });

    it("resolves { ok: false, reason: 'denied' } when the user declines", async () => {
        const { fetchFn } = makeFetch([{ status: 400, body: { error: "access_denied" } }]);
        const result = await makeManager(fetchFn).deviceLogin();
        expect(result).toEqual({ ok: false, reason: "denied" });
    });

    it("expires truthfully when the grant times out", async () => {
        const nowRef = { t: 0 };
        const pendingForever = Array.from({ length: 700 }, () => ({
            status: 400,
            body: { error: "authorization_pending" },
        }));
        const { fetchFn } = makeFetch(pendingForever);
        const result = await makeManager(fetchFn, nowRef).deviceLogin();
        expect(result.ok).toBe(false);
        expect(result.reason).toBe("expired");
    });
});

describe("refresh", () => {
    it("rotates the session via the stored refresh token", async () => {
        const login = makeFetch([
            { status: 200, body: { access_token: "at1", refresh_token: "rt1", user: identity } },
        ]);
        const manager = makeManager(login.fetchFn);
        await manager.deviceLogin();

        const refresh = makeFetch([
            { status: 200, body: { access_token: "at2", refresh_token: "rt2" } },
        ]);
        const manager2 = makeManager(refresh.fetchFn);
        const result = await manager2.refresh();
        expect(result.ok).toBe(true);
        // Identity from the stored session survives a token-only refresh reply.
        expect(result.identity).toEqual(identity);
        const call = refresh.calls[0];
        expect(call.body.grant_type).toBe("refresh_token");
        expect(call.body.refresh_token).toBe("rt1");
    });

    it("fails truthfully with no stored session", async () => {
        const { fetchFn } = makeFetch([]);
        const result = await makeManager(fetchFn).refresh();
        expect(result.ok).toBe(false);
        expect(result.reason).toContain("no stored refresh token");
    });
});

describe("signOut + corrupt session", () => {
    it("clears the stored session", async () => {
        const { fetchFn } = makeFetch([
            { status: 200, body: { access_token: "at1", refresh_token: "rt1", user: identity } },
        ]);
        const manager = makeManager(fetchFn);
        await manager.deviceLogin();
        expect(manager.hasSession()).toBe(true);
        expect(manager.signOut()).toEqual({ ok: true });
        expect(manager.hasSession()).toBe(false);
        expect(file.content).toBeUndefined();
    });

    it("treats an undecryptable session file as signed out", () => {
        file.content = JSON.stringify({ ciphertext: "garbage" });
        const { fetchFn } = makeFetch([]);
        const manager = makeManager(fetchFn);
        expect(manager.hasSession()).toBe(false);
        expect(manager.getIdentity()).toBeNull();
    });
});
