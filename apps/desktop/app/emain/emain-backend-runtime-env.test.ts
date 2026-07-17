// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * emain-backend-runtime-env tests — the pure openfang/tensorzero env resolvers
 * and the BYOK secret-store reader, with fake fs + fake decrypt (no electron,
 * no real .node files, no real secret store).
 */

import { describe, expect, it } from "vitest";
import {
    BYOK_SECRET_ENV_NAMES,
    readByokSecretsFromStore,
    resolveOpenfangRuntimeEnv,
} from "./emain-backend-runtime-env";

const RESOURCES = "/Applications/Recoder.app/Contents/Resources";

function resolveOpts(overrides: Record<string, any> = {}) {
    return {
        isPackaged: false,
        repoRoot: "/repo",
        dataDir: "/ud/backend-data",
        baseEnv: {} as NodeJS.ProcessEnv,
        existsSync: () => false,
        ...overrides,
    };
}

describe("resolveOpenfangRuntimeEnv", () => {
    it("resolves the packaged extraResources native addons when they exist", () => {
        const present = new Set([
            `${RESOURCES}/native/openfang_napi.node`,
            `${RESOURCES}/native/tensorzero_gateway_napi.node`,
        ]);
        const out = resolveOpenfangRuntimeEnv(
            resolveOpts({
                isPackaged: true,
                resourcesPath: RESOURCES,
                existsSync: (p: string) => present.has(p),
            })
        );
        expect(out.addonPath).toBe(`${RESOURCES}/native/openfang_napi.node`);
        expect(out.tensorzeroAddonPath).toBe(`${RESOURCES}/native/tensorzero_gateway_napi.node`);
    });

    it("resolves the dev repo cargo target addons (release preferred over debug)", () => {
        const present = new Set([
            "/repo/backend/engines/rust/openfang/target/release/openfang_napi.node",
            "/repo/backend/engines/rust/openfang/target/debug/openfang_napi.node",
            "/repo/backend/engines/rust/tensorzero/crates/target/debug/tensorzero_gateway_napi.node",
        ]);
        const out = resolveOpenfangRuntimeEnv(resolveOpts({ existsSync: (p: string) => present.has(p) }));
        expect(out.addonPath).toBe("/repo/backend/engines/rust/openfang/target/release/openfang_napi.node");
        expect(out.tensorzeroAddonPath).toBe(
            "/repo/backend/engines/rust/tensorzero/crates/target/debug/tensorzero_gateway_napi.node"
        );
    });

    it("returns null addon paths when nothing is built (truthful degrade, no dead paths)", () => {
        const out = resolveOpenfangRuntimeEnv(resolveOpts());
        expect(out.addonPath).toBeNull();
        expect(out.tensorzeroAddonPath).toBeNull();
    });

    it("never overrides explicit env vars (explicit wins; fill resolves to null)", () => {
        const present = new Set([
            "/repo/backend/engines/rust/openfang/target/release/openfang_napi.node",
            "/repo/backend/engines/rust/tensorzero/crates/target/release/tensorzero_gateway_napi.node",
        ]);
        const out = resolveOpenfangRuntimeEnv(
            resolveOpts({
                baseEnv: {
                    OPENFANG_NATIVE_ADDON: "/custom/openfang.node",
                    TENSORZERO_GATEWAY_NAPI_NODE: "/custom/tz.node",
                    OPENFANG_HOME: "/custom/home",
                    OPENFANG_CONFIG: "/custom/config.toml",
                },
                existsSync: (p: string) => present.has(p),
            })
        );
        expect(out.addonPath).toBeNull();
        expect(out.tensorzeroAddonPath).toBeNull();
        expect(out.homeDir).toBeNull();
        expect(out.configPath).toBeNull();
    });

    it("pins OPENFANG_HOME to a hermetic dir under the supervisor DATA_DIR", () => {
        const out = resolveOpenfangRuntimeEnv(resolveOpts());
        expect(out.homeDir).toBe("/ud/backend-data/openfang");
    });

    it("points OPENFANG_CONFIG at the home config only when it actually exists", () => {
        const withConfig = resolveOpenfangRuntimeEnv(
            resolveOpts({ existsSync: (p: string) => p === "/ud/backend-data/openfang/config.toml" })
        );
        expect(withConfig.configPath).toBe("/ud/backend-data/openfang/config.toml");

        const withoutConfig = resolveOpenfangRuntimeEnv(resolveOpts());
        expect(withoutConfig.configPath).toBeNull();
    });

    it("respects an explicit OPENFANG_HOME when probing for the home config", () => {
        const out = resolveOpenfangRuntimeEnv(
            resolveOpts({
                baseEnv: { OPENFANG_HOME: "/custom/home" },
                existsSync: (p: string) => p === "/custom/home/config.toml",
            })
        );
        expect(out.homeDir).toBeNull();
        expect(out.configPath).toBe("/custom/home/config.toml");
    });
});

describe("readByokSecretsFromStore", () => {
    const storePath = "/config/secrets.enc";

    function makeFs(content?: string) {
        return {
            existsSync: (p: string) => content != null && p === storePath,
            readFileSync: (p: string) => {
                if (content == null || p !== storePath) {
                    throw new Error(`ENOENT: ${p}`);
                }
                return content;
            },
        };
    }

    /** Fake safeStorage: "decrypt" is a base64 decode of the store content. */
    const decode = (ciphertextBase64: string) => Buffer.from(ciphertextBase64, "base64").toString("utf-8");
    const encode = (obj: object) => Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");

    it("returns {} when the secret store does not exist (no keys set — normal)", () => {
        const out = readByokSecretsFromStore({ secretsFilePath: storePath, decrypt: decode, fs: makeFs() });
        expect(out).toEqual({});
    });

    it("returns only allowlisted, non-empty provider keys (never unrelated secrets)", () => {
        const fs = makeFs(
            encode({
                ANTHROPIC_API_KEY: "sk-ant-real",
                OPENROUTER_API_KEY: "  ",
                MY_BANK_PASSWORD: "hunter2",
                "wave:writets": "2026-07-17T00:00:00Z",
            })
        );
        const out = readByokSecretsFromStore({ secretsFilePath: storePath, decrypt: decode, fs });
        expect(out).toEqual({ ANTHROPIC_API_KEY: "sk-ant-real" });
    });

    it("supports a caller-provided allowlist", () => {
        const fs = makeFs(encode({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "b" }));
        const out = readByokSecretsFromStore({
            secretsFilePath: storePath,
            decrypt: decode,
            fs,
            allowlist: ["OPENAI_API_KEY"],
        });
        expect(out).toEqual({ OPENAI_API_KEY: "b" });
    });

    it("throws truthfully on a decrypt failure (caller logs + degrades keyless)", () => {
        const fs = makeFs(encode({ ANTHROPIC_API_KEY: "a" }));
        const decrypt = () => {
            throw new Error("safeStorage unavailable");
        };
        expect(() => readByokSecretsFromStore({ secretsFilePath: storePath, decrypt, fs })).toThrow(
            /safeStorage unavailable/
        );
    });

    it("throws truthfully when the store decrypts to non-object JSON", () => {
        const fs = makeFs(Buffer.from(JSON.stringify([1, 2]), "utf-8").toString("base64"));
        expect(() => readByokSecretsFromStore({ secretsFilePath: storePath, decrypt: decode, fs })).toThrow(
            /JSON object/
        );
    });

    it("allowlists the TensorZero addressing + auth names", () => {
        expect(BYOK_SECRET_ENV_NAMES).toContain("TENSORZERO_URL");
        expect(BYOK_SECRET_ENV_NAMES).toContain("TENSORZERO_API_KEY");
        expect(BYOK_SECRET_ENV_NAMES).toContain("TENSORZERO_GATEWAY_API_KEY");
    });
});
