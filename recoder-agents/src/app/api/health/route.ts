import { resolveAuthBaseUrl } from '@/lib/runtime-urls';

export const dynamic = "force-dynamic";
const startTime = Date.now();

async function checkBackend(): Promise<{ ok: boolean; latencyMs: number }> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) return { ok: false, latencyMs: 0 };
  const t0 = Date.now();
  try {
    const res = await fetch(`${backendUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, latencyMs: Date.now() - t0 };
  }
}

async function checkAuth(): Promise<boolean> {
  const authUrl = resolveAuthBaseUrl();
  if (!authUrl) return false;
  try {
    const res = await fetch(`${authUrl}/api/auth/session`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}
export async function GET() {
  const uptimeMs = Date.now() - startTime;
  const [backend, authReachable] = await Promise.all([
    checkBackend(),
    checkAuth(),
  ]);

  const allHealthy = backend.ok && authReachable;
  const status = allHealthy ? "ok" : backend.ok || authReachable ? "degraded" : "down";
  const httpStatus = status === "down" ? 503 : 200;

  return Response.json(
    {
      status,
      service: "recoder-agents",
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptimeMs / 1000)}s`,
      version: process.env.npm_package_version ?? "unknown",
      node: process.version,
      checks: {
        backend: { ok: backend.ok, latencyMs: backend.latencyMs },
        auth: { ok: authReachable },
      },
    },
    { status: httpStatus },
  );
}
