import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSandbox, execInSandbox } from "./cloudflare-sdk.js";

describe("cloudflare sandbox sdk shim", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CLOUDFLARE_SANDBOX_BASE_URL;
  });

  it("creates/ensures sandbox session via Cloudflare API", async () => {
    process.env.CLOUDFLARE_SANDBOX_BASE_URL = "https://example.test/accounts/{accountId}/sandbox";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ success: true }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await ensureSandbox({
      sandboxId: "sbx-1",
      workdir: "/workspace",
      workspaceDir: "/tmp/work",
      accountId: "acc-123",
      apiToken: "tok-123",
      projectName: "openclaw",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/accounts/acc-123/sandbox/sessions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok-123");
  });

  it("executes command and unwraps nested result payload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({
        result: {
          stdout: "hi",
          stderr: "",
          exitCode: 0,
        },
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await execInSandbox({
      sandboxId: "sbx-2",
      command: "echo hi",
      workdir: "/workspace",
      accountId: "acc-xyz",
      apiToken: "tok-xyz",
    });

    expect(result).toEqual({ stdout: "hi", stderr: "", exitCode: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
