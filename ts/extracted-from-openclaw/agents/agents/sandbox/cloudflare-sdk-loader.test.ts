import { describe, expect, it } from "vitest";
import { loadCloudflareSandboxSdk } from "./cloudflare-sdk-loader.js";

describe("cloudflare sandbox sdk loader", () => {
  it("loads builtin shim when sdk package is omitted", async () => {
    const sdk = await loadCloudflareSandboxSdk();
    expect(typeof sdk.ensureSandbox).toBe("function");
    expect(typeof sdk.execInSandbox).toBe("function");
  });

  it("loads builtin shim when sdk package id matches default alias", async () => {
    const sdk = await loadCloudflareSandboxSdk("openclaw-cloudflare-sandbox-sdk");
    expect(typeof sdk.ensureSandbox).toBe("function");
    expect(typeof sdk.execInSandbox).toBe("function");
  });
});
