import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createBetterAuthProvider,
  createClerkAuthProvider,
  type AuthProviderPort,
} from "./auth-provider.js";
import type { RecoderAuthInstance } from "./create-recoder-auth.js";

function fakeAuth(
  getSession: (args: { headers: Headers }) => Promise<unknown>,
): RecoderAuthInstance {
  return { api: { getSession } } as unknown as RecoderAuthInstance;
}

test("createBetterAuthProvider: resolves a real identity from a valid session", async () => {
  const provider = createBetterAuthProvider(
    fakeAuth(async () => ({
      user: { id: "user_1", email: "a@example.com", emailVerified: true },
    })),
  );
  const identity = await provider.getIdentity(new Headers());
  assert.deepEqual(identity, {
    userId: "user_1",
    email: "a@example.com",
    emailVerified: true,
    provider: "better-auth",
  });
});

test("createBetterAuthProvider: null session -> null identity (not a faked session)", async () => {
  const provider = createBetterAuthProvider(fakeAuth(async () => null));
  assert.equal(await provider.getIdentity(new Headers()), null);
});

test("createBetterAuthProvider: a user with no email resolves to null (fail safe)", async () => {
  const provider = createBetterAuthProvider(
    fakeAuth(async () => ({ user: { id: "user_1", email: null } })),
  );
  assert.equal(await provider.getIdentity(new Headers()), null);
});

test("createBetterAuthProvider: a session-lookup error resolves to null, never throws", async () => {
  const provider = createBetterAuthProvider(
    fakeAuth(async () => {
      throw new Error("db unreachable");
    }),
  );
  assert.equal(await provider.getIdentity(new Headers()), null);
});

test("createBetterAuthProvider: health is always truthfully up (no provider-level dependency)", async () => {
  const provider = createBetterAuthProvider(fakeAuth(async () => null));
  assert.deepEqual(await provider.health(), { up: true });
});

test("createBetterAuthProvider: name is 'better-auth'", () => {
  const provider: AuthProviderPort = createBetterAuthProvider(fakeAuth(async () => null));
  assert.equal(provider.name, "better-auth");
});

test("createClerkAuthProvider: degrades safely with no secret key configured", async () => {
  const provider = createClerkAuthProvider({ secretKey: null });
  assert.equal(await provider.getIdentity(new Headers()), null);
  const health = await provider.health();
  assert.equal(health.up, false);
  assert.match(health.reason ?? "", /CLERK_SECRET_KEY/);
});

test("createClerkAuthProvider: degrades safely when @clerk/backend is not installed", async () => {
  // This repo has no live Clerk usage (see auth-provider.ts header comment),
  // so @clerk/backend is genuinely absent here — this exercises the REAL
  // dynamic-import failure path, not a mock.
  const provider = createClerkAuthProvider({ secretKey: "sk_test_fake" });
  assert.equal(await provider.getIdentity(new Headers()), null);
  const health = await provider.health();
  assert.equal(health.up, false);
  assert.ok(health.reason);
});

test("createClerkAuthProvider: name is 'clerk'", () => {
  const provider = createClerkAuthProvider({ secretKey: null });
  assert.equal(provider.name, "clerk");
});
