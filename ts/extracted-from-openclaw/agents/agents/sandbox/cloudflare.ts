import type { SandboxConfig } from "./types.js";
import { loadCloudflareSandboxSdk } from "./cloudflare-sdk-loader.js";
import { updateRegistry } from "./registry.js";
import { resolveSandboxScopeKey, slugifySessionKey } from "./shared.js";

type CloudflareSandboxModule = {
  ensureSandbox?: (params: {
    sandboxId: string;
    workdir: string;
    workspaceDir: string;
    accountId?: string;
    apiToken?: string;
    projectName?: string;
  }) => Promise<void>;
};

async function maybeEnsureCloudflareSandbox(params: {
  sandboxId: string;
  workspaceDir: string;
  cfg: SandboxConfig;
}) {
  const sdkPackage = params.cfg.cloudflare.sdkPackage.trim();
  if (!sdkPackage) {
    return;
  }
  const accountId = process.env[params.cfg.cloudflare.accountIdEnv];
  const apiToken = process.env[params.cfg.cloudflare.apiTokenEnv];
  let mod: CloudflareSandboxModule | null = null;
  try {
    mod = (await loadCloudflareSandboxSdk(sdkPackage)) as CloudflareSandboxModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cloudflare sandbox SDK import failed (${sdkPackage}): ${message}. ` +
        "Install/configure the SDK package or switch sandbox.provider to docker.",
      { cause: error },
    );
  }
  const ensureSandbox = mod?.ensureSandbox;
  if (typeof ensureSandbox !== "function") {
    throw new Error(
      `Cloudflare sandbox SDK (${sdkPackage}) must export an async ensureSandbox(...) function.`,
    );
  }
  await ensureSandbox({
    sandboxId: params.sandboxId,
    workdir: params.cfg.cloudflare.workdir,
    workspaceDir: params.workspaceDir,
    accountId,
    apiToken,
    projectName: params.cfg.cloudflare.projectName,
  });
}

export async function ensureCloudflareSandbox(params: {
  sessionKey: string;
  workspaceDir: string;
  cfg: SandboxConfig;
}) {
  const scopeKey = resolveSandboxScopeKey(params.cfg.scope, params.sessionKey);
  const slug = params.cfg.scope === "shared" ? "shared" : slugifySessionKey(scopeKey);
  const containerName = `${params.cfg.cloudflare.containerPrefix}${slug}`.slice(0, 63);
  await maybeEnsureCloudflareSandbox({
    sandboxId: containerName,
    workspaceDir: params.workspaceDir,
    cfg: params.cfg,
  });
  const now = Date.now();
  await updateRegistry({
    containerName,
    sessionKey: scopeKey,
    createdAtMs: now,
    lastUsedAtMs: now,
    image: "cloudflare-sandbox",
  });
  return containerName;
}
