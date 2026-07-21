// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * emain-backend-runtime-env.ts
 *
 * Pure resolvers for the NATIVE runtime env the embedded backend needs at
 * spawn time so the in-process openfang agent runtime (and the TensorZero
 * gateway it routes model calls through) can run REAL turns in the packaged
 * desktop:
 *
 *   - openfang addon (.node) + a hermetic OPENFANG_HOME/config under the
 *     supervisor's DATA_DIR (packaged: <resourcesPath>/native; dev: the repo
 *     cargo target dirs).
 *   - tensorzero gateway addon (.node) addressing (same native/ convention).
 *   - BYOK provider keys read from the SAME encrypted secret store the
 *     terminal's secrets UI writes (<configDir>/secrets.enc — safeStorage
 *     ciphertext, base64), injected as the <PROVIDER>_API_KEY env vars the
 *     openfang kernel + TensorZero gateway read.
 *
 * Everything is TRUTHFUL and fill-only: an already-set env var is never
 * overridden, a missing addon/config/secret resolves to null/absent (the
 * backend then reports the runtime unavailable with a reason) — never a dead
 * path and never a faked value.
 *
 * This module has NO electron imports so it can be unit-tested with fakes
 * (see emain-backend-runtime-env.test.ts). The electron glue (safeStorage
 * decrypt) lives in emain-backend.ts.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

/**
 * The env var each piece of the native runtime reads (mirrors the backend's
 * resolvers: engines/openfang-native.ts + inference/tensorzero-embedded-client.ts
 * and the openfang kernel's OPENFANG_HOME/OPENFANG_CONFIG contract).
 */
export const OPENFANG_ADDON_ENV = "OPENFANG_NATIVE_ADDON";
export const OPENFANG_HOME_ENV = "OPENFANG_HOME";
export const OPENFANG_CONFIG_ENV = "OPENFANG_CONFIG";
export const TENSORZERO_ADDON_ENV = "TENSORZERO_GATEWAY_NAPI_NODE";

/**
 * The embedded vector store reads these: RECODER_NATIVE_DIR / LANCE_NATIVE_DIR
 * point the napi loader at the packaged <resourcesPath>/native dir (where the
 * governance + lance .node land); LANCE_DATA_DIR is the on-disk store root. All
 * are set ONLY when the artifact is actually present so an absent lance addon
 * leaves the backend degrading to Qdrant/no-op truthfully (never a dead path).
 */
export const RECODER_NATIVE_DIR_ENV = "RECODER_NATIVE_DIR";
export const LANCE_NATIVE_DIR_ENV = "LANCE_NATIVE_DIR";
export const LANCE_DATA_DIR_ENV = "LANCE_DATA_DIR";

/**
 * BYOK provider-key names the openfang kernel (model_catalog.rs api_key_env)
 * and the embedded TensorZero gateway resolve from env. Only these names are
 * ever lifted out of the secret store into the backend spawn env — the store
 * may hold unrelated user secrets that must NOT leak into a child process.
 */
export const BYOK_SECRET_ENV_NAMES: readonly string[] = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "DEEPSEEK_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "MISTRAL_API_KEY",
    "TOGETHER_API_KEY",
    "FIREWORKS_API_KEY",
    "PERPLEXITY_API_KEY",
    "COHERE_API_KEY",
    "XAI_API_KEY",
    "CEREBRAS_API_KEY",
    "SAMBANOVA_API_KEY",
    "HF_API_KEY",
    "AZURE_OPENAI_API_KEY",
    // TensorZero gateway addressing + auth (external-gateway BYOK path).
    "TENSORZERO_URL",
    "TENSORZERO_API_KEY",
    "TENSORZERO_GATEWAY_API_KEY",
];

/**
 * Connector ADDRESSING secrets (endpoints, not provider keys) that ride the
 * SAME encrypted store, still allowlisted so unrelated user secrets never leak
 * into the child. HONESTY: we never fabricate a localhost URL for a sidecar we
 * did not package — if the user configured no cloud/self-hosted endpoint the
 * var stays absent and the backend reports the capability `down` truthfully.
 *   - MEM0_BASE_URL:      points the platform mem0 client at a cloud sidecar.
 *   - COLBERT_RERANK_URL: cloud rerank endpoint; absent → identity order.
 *   - QDRANT_URL/KEY:     external vector store (alternative to embedded Lance).
 */
export const CONNECTOR_SECRET_ENV_NAMES: readonly string[] = [
    "MEM0_BASE_URL",
    "COLBERT_RERANK_URL",
    "QDRANT_URL",
    "QDRANT_API_KEY",
];

/**
 * The resolved native-runtime env values to FILL into the backend spawn env.
 * `null` means "nothing to inject" — either the piece is absent on disk
 * (truthful degrade; the backend reports the runtime unavailable) or the
 * operator already set the env var explicitly (explicit always wins).
 */
export interface OpenfangRuntimeEnv {
    addonPath: string | null;
    homeDir: string | null;
    configPath: string | null;
    tensorzeroAddonPath: string | null;
}

/**
 * Resolve the openfang + tensorzero native runtime env for the backend child.
 * Packaged: electron-builder extraResources lands the .node addons in
 * <resourcesPath>/native/. Dev: the repo cargo target dirs. Only EXISTING
 * paths are returned; OPENFANG_HOME is pinned to a hermetic, writable dir
 * under the supervisor's DATA_DIR (the packaged app must never silently
 * adopt ~/.openfang).
 */
export function resolveOpenfangRuntimeEnv(opts: {
    isPackaged: boolean;
    repoRoot: string;
    resourcesPath?: string;
    dataDir: string;
    baseEnv?: NodeJS.ProcessEnv;
    existsSync?: (p: string) => boolean;
}): OpenfangRuntimeEnv {
    const env = opts.baseEnv ?? process.env;
    const existsSync = opts.existsSync ?? nodeFs.existsSync;

    const firstExisting = (candidates: string[]): string | null => {
        for (const candidate of candidates) {
            if (existsSync(candidate)) {
                return candidate;
            }
        }
        return null;
    };

    const openfangRoot = nodePath.join(opts.repoRoot, "backend", "engines", "rust", "openfang");
    const addonPath = env[OPENFANG_ADDON_ENV]?.trim()
        ? null
        : firstExisting([
              ...(opts.isPackaged && opts.resourcesPath
                  ? [nodePath.join(opts.resourcesPath, "native", "openfang_napi.node")]
                  : []),
              nodePath.join(openfangRoot, "target", "release", "openfang_napi.node"),
              nodePath.join(openfangRoot, "target", "debug", "openfang_napi.node"),
              nodePath.join(openfangRoot, "crates", "openfang-napi", "target", "release", "openfang_napi.node"),
              nodePath.join(openfangRoot, "crates", "openfang-napi", "target", "debug", "openfang_napi.node"),
          ]);

    const tensorzeroTarget = nodePath.join(
        opts.repoRoot,
        "backend",
        "engines",
        "rust",
        "tensorzero",
        "crates",
        "target"
    );
    const tensorzeroAddonPath = env[TENSORZERO_ADDON_ENV]?.trim()
        ? null
        : firstExisting([
              ...(opts.isPackaged && opts.resourcesPath
                  ? [nodePath.join(opts.resourcesPath, "native", "tensorzero_gateway_napi.node")]
                  : []),
              nodePath.join(tensorzeroTarget, "release", "tensorzero_gateway_napi.node"),
              nodePath.join(tensorzeroTarget, "debug", "tensorzero_gateway_napi.node"),
          ]);

    // Hermetic kernel home under the supervisor's private DATA_DIR: writable in
    // the packaged app, per-install, and never ~/.openfang by accident. The
    // kernel creates the dir + a default config on first boot.
    const explicitHome = env[OPENFANG_HOME_ENV]?.trim();
    const homeDir = explicitHome ? null : nodePath.join(opts.dataDir, "openfang");

    // Point OPENFANG_CONFIG only at a config that actually exists (explicit env
    // wins untouched); otherwise the kernel boots its default under the home.
    const effectiveHome = explicitHome || nodePath.join(opts.dataDir, "openfang");
    const homeConfig = nodePath.join(effectiveHome, "config.toml");
    const configPath = env[OPENFANG_CONFIG_ENV]?.trim() ? null : existsSync(homeConfig) ? homeConfig : null;

    return { addonPath, homeDir, configPath, tensorzeroAddonPath };
}

/**
 * The resolved embedded-vector env to FILL into the backend spawn env.
 * `null` means "nothing to inject": in dev, or when the packaged native dir /
 * lance addon is absent — so the embedded Lance store stays a truthful no-op
 * (the backend degrades to Qdrant/no-op) instead of dlopen-ing a missing .node.
 */
export interface EmbeddedVectorEnv {
    nativeDir: string | null;
    lanceDataDir: string | null;
}

/**
 * Resolve the embedded vector-store env for the backend child. Packaged:
 * electron-builder extraResources lands the native .node addons in
 * <resourcesPath>/native, so RECODER_NATIVE_DIR / LANCE_NATIVE_DIR point there
 * to make governance + lance resolution EXPLICIT (not only the resourcesPath
 * probe in the backend's napi-loader). LANCE_DATA_DIR is returned ONLY when the
 * lance addon is actually on disk — otherwise the embedded store must stay a
 * no-op (backend degrades to Qdrant), never a load of a missing addon. Dev
 * (isPackaged:false) returns all-null: the repo has no packaged native dir and
 * lance is not built here. Explicit env always wins (fill resolves to null).
 */
export function resolveEmbeddedVectorEnv(opts: {
    isPackaged: boolean;
    resourcesPath?: string;
    dataDir: string;
    baseEnv?: NodeJS.ProcessEnv;
    existsSync?: (p: string) => boolean;
}): EmbeddedVectorEnv {
    const env = opts.baseEnv ?? process.env;
    const existsSync = opts.existsSync ?? nodeFs.existsSync;

    const nativeDir = opts.isPackaged && opts.resourcesPath ? nodePath.join(opts.resourcesPath, "native") : null;

    const lanceAddonPresent = !!nativeDir && existsSync(nodePath.join(nativeDir, "lance_npm_bindings.node"));
    const lanceDataDir =
        lanceAddonPresent && !env[LANCE_DATA_DIR_ENV]?.trim() ? nodePath.join(opts.dataDir, "lance") : null;

    return { nativeDir, lanceDataDir };
}

/** The minimal fs surface the secret-store reader needs (injectable for tests). */
export interface SecretsFsLike {
    existsSync(p: string): boolean;
    readFileSync(p: string, encoding: string): string;
}

/**
 * Read the BYOK provider keys out of the terminal's encrypted secret store
 * (<configDir>/secrets.enc — the SAME file the Go server's secretstore writes
 * via the electron encrypt route). Returns only allowlisted, non-empty string
 * values. A missing store is a normal `{}` (the user set no keys); a
 * decrypt/parse failure THROWS so the caller can log the truthful reason and
 * continue keyless — never silently faked as "no secrets".
 */
export function readByokSecretsFromStore(opts: {
    secretsFilePath: string;
    /** safeStorage decrypt seam: base64 ciphertext -> plaintext JSON. */
    decrypt: (ciphertextBase64: string) => string;
    fs?: SecretsFsLike;
    allowlist?: readonly string[];
}): Record<string, string> {
    const fs: SecretsFsLike = opts.fs ?? (nodeFs as unknown as SecretsFsLike);
    const allowlist = opts.allowlist ?? BYOK_SECRET_ENV_NAMES;
    if (!fs.existsSync(opts.secretsFilePath)) {
        return {};
    }
    const ciphertext = fs.readFileSync(opts.secretsFilePath, "utf-8").trim();
    if (!ciphertext) {
        return {};
    }
    const parsed = JSON.parse(opts.decrypt(ciphertext));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("secret store did not decrypt to a JSON object");
    }
    const secrets: Record<string, string> = {};
    for (const name of allowlist) {
        const value = (parsed as Record<string, unknown>)[name];
        if (typeof value === "string" && value.trim()) {
            secrets[name] = value;
        }
    }
    return secrets;
}
