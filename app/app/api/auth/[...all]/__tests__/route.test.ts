import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Keep the CORS surface list deterministic and independent of the workspace
// package build state.
vi.mock("@recoder/auth/edge", () => ({
  SURFACE_ORIGINS: { app: "https://recoder.xyz" },
}));

// The route must call the LOCAL Better Auth instance (lib/auth-config.ts) —
// the same one every other route in the app already depends on — instead of
// proxying to a separate backend that production has never actually run.
// Stub `auth` itself (not exercised directly, just needs to be a stable
// reference `toNextJsHandler` can be mocked against) and control what
// `toNextJsHandler` hands back per test.
vi.mock("@/lib/auth-config", () => ({ auth: { $Infer: {} } }));

type Handlers = { GET: (req: NextRequest) => Promise<Response>; POST: (req: NextRequest) => Promise<Response> };

function mockLocalHandlers(handlers: Partial<Handlers>) {
  const GET = handlers.GET ?? vi.fn(async () => new Response(null, { status: 200 }));
  const POST = handlers.POST ?? vi.fn(async () => new Response(null, { status: 200 }));
  vi.doMock("better-auth/next-js", () => ({
    toNextJsHandler: () => ({ GET, POST }),
  }));
  return { GET, POST };
}

describe("/api/auth/[...all] — serves the local Better Auth instance directly", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("better-auth/next-js");
  });

  it("converts GET /sign-in/social into a POST against the local handler and redirects to the returned url", async () => {
    const POST = vi.fn(async () =>
      new Response(JSON.stringify({ url: "https://github.com/login/oauth" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockLocalHandlers({ POST });

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest(
        "https://recoder.xyz/api/auth/sign-in/social?provider=github&callbackURL=/dashboard",
        { headers: { origin: "https://recoder.xyz" } },
      ) as any,
    );

    expect(POST).toHaveBeenCalledTimes(1);
    const calledWith = POST.mock.calls[0][0] as NextRequest;
    expect(calledWith.method).toBe("POST");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://github.com/login/oauth");
  });

  it("forwards the catch-all GET (e.g. get-session) to the local handler and attaches CORS headers", async () => {
    const GET_impl = vi.fn(
      async () =>
        new Response(JSON.stringify({ user: { id: "1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    mockLocalHandlers({ GET: GET_impl });

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://recoder.xyz/api/auth/get-session", {
        headers: { origin: "https://recoder.xyz" },
      }) as any,
    );

    expect(GET_impl).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://recoder.xyz");
  });

  it("forwards the catch-all POST (e.g. sign-in/sign-up) to the local handler", async () => {
    const POST_impl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    mockLocalHandlers({ POST: POST_impl });

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("https://recoder.xyz/api/auth/sign-up/social", {
        method: "POST",
        headers: { origin: "https://recoder.xyz", "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
      }) as any,
    );

    expect(POST_impl).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it("degrades truthfully to 503 instead of a faked session when the local handler throws", async () => {
    const GET_impl = vi.fn(async () => {
      throw new Error("db unreachable");
    });
    mockLocalHandlers({ GET: GET_impl });

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://recoder.xyz/api/auth/get-session", {
        headers: { origin: "https://recoder.xyz" },
      }) as any,
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/db unreachable/i);
  });

  it("does not set Access-Control-Allow-Origin for an untrusted origin", async () => {
    mockLocalHandlers({});

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://recoder.xyz/api/auth/get-session", {
        headers: { origin: "https://evil.example.com" },
      }) as any,
    );

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
