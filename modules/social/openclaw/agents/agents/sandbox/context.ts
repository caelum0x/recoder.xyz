import fs from "node:fs/promises";
import type { OpenClawConfig } from "../../config/config.js";
import type { SandboxContext, SandboxWorkspaceInfo } from "./types.js";
import { DEFAULT_BROWSER_EVALUATE_ENABLED } from "../../browser/constants.js";
import { defaultRuntime } from "../../runtime.js";
import { resolveUserPath } from "../../utils.js";
import { syncSkillsToWorkspace } from "../skills.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../workspace.js";
import { ensureSandboxBrowser } from "./browser.js";
import { ensureCloudflareSandbox } from "./cloudflare.js";
import { resolveSandboxConfigForAgent } from "./config.js";
import { ensureSandboxContainer } from "./docker.js";
import { maybePruneSandboxes } from "./prune.js";
import { resolveSandboxRuntimeStatus } from "./runtime-status.js";
import { resolveSandboxScopeKey, resolveSandboxWorkspaceDir } from "./shared.js";
import { ensureSandboxWorkspace } from "./workspace.js";

const CLOUDFLARE_ENV_WARNING_KEYS = new Set<string>();

function noteCloudflareSandboxEnvWarnings(cfg: {
  provider: string;
  cloudflare: { accountIdEnv: string; apiTokenEnv: string };
  sessionKey: string;
}) {
  if (cfg.provider !== "cloudflare") {
    return;
  }
  const missing: string[] = [];
  const accountEnv = cfg.cloudflare.accountIdEnv.trim();
  const tokenEnv = cfg.cloudflare.apiTokenEnv.trim();
  if (accountEnv && !process.env[accountEnv]?.trim()) {
    missing.push(accountEnv);
  }
  if (tokenEnv && !process.env[tokenEnv]?.trim()) {
    missing.push(tokenEnv);
  }
  if (missing.length === 0) {
    return;
  }
  const warningKey = `${cfg.sessionKey}|${missing.toSorted().join(",")}`;
  if (CLOUDFLARE_ENV_WARNING_KEYS.has(warningKey)) {
    return;
  }
  CLOUDFLARE_ENV_WARNING_KEYS.add(warningKey);
  defaultRuntime.error?.(
    `Sandbox provider=cloudflare missing env vars: ${missing.join(", ")} (session=${cfg.sessionKey})`,
  );
}

export async function resolveSandboxContext(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  workspaceDir?: string;
}): Promise<SandboxContext | null> {
  const rawSessionKey = params.sessionKey?.trim();
  if (!rawSessionKey) {
    return null;
  }

  const runtime = resolveSandboxRuntimeStatus({
    cfg: params.config,
    sessionKey: rawSessionKey,
  });
  if (!runtime.sandboxed) {
    return null;
  }

  const cfg = resolveSandboxConfigForAgent(params.config, runtime.agentId);
  noteCloudflareSandboxEnvWarnings({
    provider: cfg.provider,
    cloudflare: cfg.cloudflare,
    sessionKey: rawSessionKey,
  });

  await maybePruneSandboxes(cfg);

  const agentWorkspaceDir = resolveUserPath(
    params.workspaceDir?.trim() || DEFAULT_AGENT_WORKSPACE_DIR,
  );
  const workspaceRoot = resolveUserPath(cfg.workspaceRoot);
  const scopeKey = resolveSandboxScopeKey(cfg.scope, rawSessionKey);
  const sandboxWorkspaceDir =
    cfg.scope === "shared" ? workspaceRoot : resolveSandboxWorkspaceDir(workspaceRoot, scopeKey);
  const workspaceDir = cfg.workspaceAccess === "rw" ? agentWorkspaceDir : sandboxWorkspaceDir;
  if (workspaceDir === sandboxWorkspaceDir) {
    await ensureSandboxWorkspace(
      sandboxWorkspaceDir,
      agentWorkspaceDir,
      params.config?.agents?.defaults?.skipBootstrap,
    );
    if (cfg.workspaceAccess !== "rw") {
      try {
        await syncSkillsToWorkspace({
          sourceWorkspaceDir: agentWorkspaceDir,
          targetWorkspaceDir: sandboxWorkspaceDir,
          config: params.config,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        defaultRuntime.error?.(`Sandbox skill sync failed: ${message}`);
      }
    }
  } else {
    await fs.mkdir(workspaceDir, { recursive: true });
  }

  const containerName =
    cfg.provider === "cloudflare"
      ? await ensureCloudflareSandbox({
          sessionKey: rawSessionKey,
          workspaceDir,
          cfg,
        })
      : await ensureSandboxContainer({
          sessionKey: rawSessionKey,
          workspaceDir,
          agentWorkspaceDir,
          cfg,
        });

  const evaluateEnabled =
    params.config?.browser?.evaluateEnabled ?? DEFAULT_BROWSER_EVALUATE_ENABLED;
  const browser =
    cfg.provider === "docker"
      ? await ensureSandboxBrowser({
          scopeKey,
          workspaceDir,
          agentWorkspaceDir,
          cfg,
          evaluateEnabled,
        })
      : null;

  return {
    enabled: true,
    provider: cfg.provider,
    sessionKey: rawSessionKey,
    workspaceDir,
    agentWorkspaceDir,
    workspaceAccess: cfg.workspaceAccess,
    containerName,
    containerWorkdir: cfg.provider === "cloudflare" ? cfg.cloudflare.workdir : cfg.docker.workdir,
    env: cfg.provider === "cloudflare" ? cfg.cloudflare.env : cfg.docker.env,
    docker: cfg.docker,
    cloudflare: cfg.cloudflare,
    tools: cfg.tools,
    browserAllowHostControl: cfg.browser.allowHostControl,
    browser: browser ?? undefined,
  };
}

export async function ensureSandboxWorkspaceForSession(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  workspaceDir?: string;
}): Promise<SandboxWorkspaceInfo | null> {
  const rawSessionKey = params.sessionKey?.trim();
  if (!rawSessionKey) {
    return null;
  }

  const runtime = resolveSandboxRuntimeStatus({
    cfg: params.config,
    sessionKey: rawSessionKey,
  });
  if (!runtime.sandboxed) {
    return null;
  }

  const cfg = resolveSandboxConfigForAgent(params.config, runtime.agentId);

  const agentWorkspaceDir = resolveUserPath(
    params.workspaceDir?.trim() || DEFAULT_AGENT_WORKSPACE_DIR,
  );
  const workspaceRoot = resolveUserPath(cfg.workspaceRoot);
  const scopeKey = resolveSandboxScopeKey(cfg.scope, rawSessionKey);
  const sandboxWorkspaceDir =
    cfg.scope === "shared" ? workspaceRoot : resolveSandboxWorkspaceDir(workspaceRoot, scopeKey);
  const workspaceDir = cfg.workspaceAccess === "rw" ? agentWorkspaceDir : sandboxWorkspaceDir;
  if (workspaceDir === sandboxWorkspaceDir) {
    await ensureSandboxWorkspace(
      sandboxWorkspaceDir,
      agentWorkspaceDir,
      params.config?.agents?.defaults?.skipBootstrap,
    );
    if (cfg.workspaceAccess !== "rw") {
      try {
        await syncSkillsToWorkspace({
          sourceWorkspaceDir: agentWorkspaceDir,
          targetWorkspaceDir: sandboxWorkspaceDir,
          config: params.config,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        defaultRuntime.error?.(`Sandbox skill sync failed: ${message}`);
      }
    }
  } else {
    await fs.mkdir(workspaceDir, { recursive: true });
  }

  return {
    workspaceDir,
    containerWorkdir: cfg.provider === "cloudflare" ? cfg.cloudflare.workdir : cfg.docker.workdir,
  };
}
