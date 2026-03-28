const BUILTIN_SDK_ID = "openclaw-cloudflare-sandbox-sdk";

export type CloudflareSandboxSdkModule = {
  ensureSandbox?: (params: {
    sandboxId: string;
    workdir: string;
    workspaceDir: string;
    accountId?: string;
    apiToken?: string;
    projectName?: string;
  }) => Promise<void>;
  execInSandbox?: (params: {
    sandboxId: string;
    command: string;
    workdir?: string;
    env?: Record<string, string>;
    accountId?: string;
    apiToken?: string;
    projectName?: string;
  }) => Promise<unknown>;
  runCommand?: (params: {
    sandboxId: string;
    command: string;
    workdir?: string;
    env?: Record<string, string>;
    accountId?: string;
    apiToken?: string;
    projectName?: string;
  }) => Promise<unknown>;
  execute?: (params: {
    sandboxId: string;
    command: string;
    workdir?: string;
    env?: Record<string, string>;
    accountId?: string;
    apiToken?: string;
    projectName?: string;
  }) => Promise<unknown>;
  default?: CloudflareSandboxSdkModule;
};

export async function loadCloudflareSandboxSdk(
  sdkPackage?: string,
): Promise<CloudflareSandboxSdkModule> {
  const resolved = (sdkPackage ?? "").trim();
  if (!resolved || resolved === BUILTIN_SDK_ID) {
    return (await import("./cloudflare-sdk.js")) as CloudflareSandboxSdkModule;
  }
  return (await import(resolved)) as CloudflareSandboxSdkModule;
}
