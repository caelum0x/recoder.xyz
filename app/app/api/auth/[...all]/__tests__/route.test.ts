import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Keep the CORS surface list deterministic and independent of the workspace
// package build state.
vi.mock("@recoder/auth/edge", () => ({
  SURFACE_ORIGINS: { app: "https://recoder.xyz" },
}));

/** Capture what the proxy forwards to the backend so we can assert on headers. */
type FetchCall = { url: string; init: RequestInit & { headers: Headers } };

function installFetchMock(response: Response): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init: { ...init, headers: init.headers as Headers } });
    return response;
  }));
  return calls;
}

describe("/api/auth/[...all] proxy — social sign-in Content-Type fix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // BACKEND_URL / PORT are read once at module load into module-level
    // consts (matches the route's own pattern) — force a fresh import per
    // test so env overrides below actually take effect.
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BACKEND_URL;
    delete process.env.RECODER_BACKEND_URL;
    delete process.env.PORT;
  });

  it("stamps Content-Type: application/json on the GET->POST social conversion", async () => {
    const calls = installFetchMock(
      new Response(JSON.stringify({ url: "https://github.com/login/oauth" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest(
        "https://recoder.xyz/api/auth/sign-in/social?provider=github&callbackURL=/dashboard",
        { headers: { origin: "https://recoder.xyz" } },
      ) as any,
    );

    // The synthesized upstream POST must carry the JSON Content-Type so Better
    // Auth can read {provider, callbackURL}. This is the correctness fix.
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Headers).get("content-type")).toBe("application/json");

    // And it should issue a real redirect to the provider URL.
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://github.com/login/oauth");
  });

  it("forwards the catch-all POST body verbatim, preserving the client Content-Type", async () => {
    const calls = installFetchMock(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { POST } = await import("../route");
    await POST(
      new NextRequest("https://recoder.xyz/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          origin: "https://recoder.xyz",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "email=a@b.com&password=secret",
      }) as any,
    );

    // The verbatim path must NOT be rewritten to application/json — the client's
    // own Content-Type flows through untouched.
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Headers).get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("does not inject a Content-Type on a plain GET catch-all", async () => {
    const calls = installFetchMock(new Response(null, { status: 200 }));

    const { GET } = await import("../route");
    await GET(
      new NextRequest("https://recoder.xyz/api/auth/get-session", {
        headers: { origin: "https://recoder.xyz" },
      }) as any,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("GET");
    expect((calls[0].init.headers as Headers).get("content-type")).toBeNull();
  });
});

describe("/api/auth/[...all] proxy — self-referential BACKEND_URL guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BACKEND_URL;
    delete process.env.RECODER_BACKEND_URL;
    delete process.env.PORT;
  });

  it("fails fast with a clear 503 and never calls fetch when BACKEND_URL resolves to this same process", async () => {
    process.env.PORT = "3001";
    process.env.BACKEND_URL = "http://localhost:3001";
    const calls = installFetchMock(new Response(null, { status: 200 }));

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://recoder.xyz/api/auth/get-session", {
        headers: { origin: "https://recoder.xyz" },
      }) as any,
    );

    // The whole point of the guard: zero outbound fetches, not a failed one.
    expect(calls).toHaveLength(0);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/misconfigured/i);
  });

  it("also guards the POST path (e.g. sign-in/sign-out), not just GET", async () => {
    process.env.PORT = "3001";
    process.env.BACKEND_URL = "http://127.0.0.1:3001";
    const calls = installFetchMock(new Response(null, { status: 200 }));

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("https://recoder.xyz/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin: "https://recoder.xyz", "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: "secret" }),
      }) as any,
    );

    expect(calls).toHaveLength(0);
    expect(res.status).toBe(503);
  });

  it("does NOT trip the guard when BACKEND_URL points at a different port (the normal/intended case)", async () => {
    process.env.PORT = "3001";
    process.env.BACKEND_URL = "http://127.0.0.1:8000";
    const calls = installFetchMock(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://recoder.xyz/api/auth/get-session", {
        headers: { origin: "https://recoder.xyz" },
      }) as any,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:8000/api/auth/get-session");
    expect(res.status).toBe(200);
  });

  it("does NOT trip the guard for a same-port but non-loopback hostname", async () => {
    process.env.PORT = "3001";
    process.env.BACKEND_URL = "http://identity.internal:3001";
    const calls = installFetchMock(new Response(null, { status: 200 }));

    const { GET } = await import("../route");
    await GET(
      new NextRequest("https://recoder.xyz/api/auth/get-session", {
        headers: { origin: "https://recoder.xyz" },
      }) as any,
    );

    expect(calls).toHaveLength(1);
  });
});
