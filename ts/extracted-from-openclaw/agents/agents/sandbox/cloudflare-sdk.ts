type CloudflareSandboxRequestParams = {
  sandboxId: string;
  accountId?: string;
  apiToken?: string;
  projectName?: string;
};

function requireCloudflareCredential(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Cloudflare sandbox requires ${name}.`);
  }
  return trimmed;
}

function resolveCloudflareSandboxBaseUrl(accountId: string) {
  const template =
    process.env.CLOUDFLARE_SANDBOX_BASE_URL ??
    "https://api.cloudflare.com/client/v4/accounts/{accountId}/sandbox";
  return template.replaceAll("{accountId}", accountId);
}

async function cloudflareSandboxRequest<T>(params: {
  auth: CloudflareSandboxRequestParams;
  method: "POST";
  path: string;
  body: Record<string, unknown>;
}): Promise<T> {
  const accountId = requireCloudflareCredential(params.auth.accountId, "accountId");
  const apiToken = requireCloudflareCredential(params.auth.apiToken, "apiToken");
  const baseUrl = resolveCloudflareSandboxBaseUrl(accountId);
  const url = `${baseUrl.replace(/\/+$/, "")}${params.path}`;
  const response = await fetch(url, {
    method: params.method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(params.body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Cloudflare sandbox request failed (${response.status} ${response.statusText}): ${text}`.trim(),
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {} as T;
  }
  return (await response.json()) as T;
}

export async function ensureSandbox(params: {
  sandboxId: string;
  workdir: string;
  workspaceDir: string;
  accountId?: string;
  apiToken?: string;
  projectName?: string;
}): Promise<void> {
  await cloudflareSandboxRequest({
    auth: params,
    method: "POST",
    path: "/sessions",
    body: {
      id: params.sandboxId,
      projectName: params.projectName,
      workdir: params.workdir,
      workspaceDir: params.workspaceDir,
    },
  });
}

export async function execInSandbox(params: {
  sandboxId: string;
  command: string;
  workdir?: string;
  env?: Record<string, string>;
  accountId?: string;
  apiToken?: string;
  projectName?: string;
}): Promise<unknown> {
  const response = await cloudflareSandboxRequest<{
    result?: {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  }>({
    auth: params,
    method: "POST",
    path: `/sessions/${encodeURIComponent(params.sandboxId)}/exec`,
    body: {
      command: params.command,
      workdir: params.workdir,
      env: params.env,
      projectName: params.projectName,
    },
  });
  if (response.result && typeof response.result === "object") {
    return response.result;
  }
  return response;
}
