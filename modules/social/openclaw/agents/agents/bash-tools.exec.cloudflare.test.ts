import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const execInSandbox = vi.fn(async () => ({
    stdout: "cloudflare-ok\n",
    stderr: "",
    exitCode: 0,
  }));
  const loadCloudflareSandboxSdk = vi.fn(async () => ({
    execInSandbox,
  }));
  const spawnWithFallback = vi.fn(async () => {
    throw new Error("spawnWithFallback should not be called for cloudflare sandbox");
  });
  return { execInSandbox, loadCloudflareSandboxSdk, spawnWithFallback };
});

vi.mock("./sandbox/cloudflare-sdk-loader.js", () => ({
  loadCloudflareSandboxSdk: mocks.loadCloudflareSandboxSdk,
}));

vi.mock("../process/spawn-utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../process/spawn-utils.js")>();
  return {
    ...actual,
    spawnWithFallback: mocks.spawnWithFallback,
  };
});

describe("exec cloudflare sandbox provider", () => {
  it("executes using cloudflare sdk and bypasses docker spawn", async () => {
    const { createExecTool } = await import("./bash-tools.exec.js");

    const tool = createExecTool({
      sandbox: {
        provider: "cloudflare",
        containerName: "cf-sbx-test",
        workspaceDir: "/tmp/work",
        containerWorkdir: "/workspace",
        env: { BASE: "1" },
        cloudflare: {
          sdkPackage: "openclaw-cloudflare-sandbox-sdk",
          accountIdEnv: "CLOUDFLARE_ACCOUNT_ID",
          apiTokenEnv: "CLOUDFLARE_API_TOKEN",
          projectName: "openclaw",
        },
      },
      host: "sandbox",
      ask: "off",
      security: "full",
      allowBackground: false,
      timeoutSec: 30,
    });

    const result = await tool.execute("call-1", {
      command: "echo hello",
      env: { EXTRA: "2" },
    });

    expect(mocks.loadCloudflareSandboxSdk).toHaveBeenCalledWith("openclaw-cloudflare-sandbox-sdk");
    expect(mocks.execInSandbox).toHaveBeenCalledTimes(1);
    expect(mocks.spawnWithFallback).not.toHaveBeenCalled();
    const text = result.content.find((item) => item.type === "text")?.text ?? "";
    expect(text).toContain("cloudflare-ok");
    expect(result.details.status).toBe("completed");
  });
});
