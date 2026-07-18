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
  });
  afterEach(() => {
    vi.unstubAllGlobals();
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
