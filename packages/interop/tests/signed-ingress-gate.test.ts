import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import {
  canonicalJson,
  createHmacSha256Signature,
  createSignedEnvelope,
  type SignedEnvelope,
  type SignedEnvelopeSignature,
} from "@recoder/a2a-sdk";
import type { McpServerRegistration } from "@recoder/agent-mcp";
import type { AgentProfile } from "@recoder/agent-os";
import { admitSignedMcpCall, type McpCallClaim } from "../src/signed-ingress-gate";

const HMAC_SECRET = "interop-edge-secret";

/** A minimal MCP server registration that exposes one tool. */
function server(overrides: Partial<McpServerRegistration> = {}): McpServerRegistration {
  return {
    serverId: "srv-repo",
    kind: "repo",
    displayName: "Repo MCP",
    transport: "http",
    enabled: true,
    toolNames: ["repo.read"],
    ...overrides,
  };
}

/** A minimal actor profile; toolRules default to empty (allow-by-registry). */
function actor(overrides: Partial<AgentProfile["permissions"]> = {}): AgentProfile {
  return {
    agentId: "agent-1",
    displayName: "Test Agent",
    vendorSurface: "claude_code",
    connectorId: "conn-1",
    runtimeKind: "claude_code",
    capabilities: [],
    tools: [],
    supportedTaskIntents: [],
    permissions: {
      defaultFileEffect: "deny",
      pathRules: [],
      toolRules: [],
      allowNetwork: false,
      allowShell: false,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
      ...overrides,
    },
    approvalPolicy: { mode: "policy", riskThreshold: "medium", autoApproveLowRisk: false },
    memoryScope: { read: [], write: [] },
    cwdPolicy: { mode: "fixed", root: "/repo" },
    health: { status: "online", detail: "ok", checkedAt: new Date().toISOString() },
    lastSeenAt: new Date().toISOString(),
  } as unknown as AgentProfile;
}

function claim(overrides: Partial<McpCallClaim> = {}): McpCallClaim {
  return {
    server: server(),
    toolName: "repo.read",
    actor: actor(),
    args: { path: "src/index.ts" },
    ...overrides,
  };
}

/** Build a real HMAC-signed envelope over `payload`. */
function hmacEnvelope(payload: unknown, secret = HMAC_SECRET): SignedEnvelope {
  const signature: SignedEnvelopeSignature = {
    algorithm: "hmac-sha256",
    key_id: "edge-hmac",
    signature: createHmacSha256Signature(payload, secret),
    signed_at: new Date().toISOString(),
  };
  return createSignedEnvelope({ id: "env-1", payload_type: "mcp.call", payload, signature });
}

/** Build a real ed25519-signed envelope over `payload` with a fresh keypair. */
function ed25519Envelope(payload: unknown) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const sig = cryptoSign(null, Buffer.from(canonicalJson(payload), "utf8"), privateKey).toString("hex");
  const signature: SignedEnvelopeSignature = {
    algorithm: "ed25519",
    key_id: "edge-ed25519",
    signature: sig,
    signed_at: new Date().toISOString(),
  };
  const envelope = createSignedEnvelope({ id: "env-ed", payload_type: "mcp.call", payload, signature });
  return { envelope, publicKey };
}

const PAYLOAD = { kind: "mcp.call", tool: "repo.read", path: "src/index.ts" };

// --- HMAC path -------------------------------------------------------------

test("admits a valid HMAC envelope whose tool-call is permitted", () => {
  const result = admitSignedMcpCall(hmacEnvelope(PAYLOAD), claim(), { hmacSecret: HMAC_SECRET });
  assert.equal(result.admitted, true);
  if (result.admitted) {
    assert.deepEqual(result.payload, PAYLOAD);
    assert.equal(result.decision.allowed, true);
    assert.ok(result.decision.policyDecision);
  }
});

test("rejects a tampered HMAC payload at the signature stage", () => {
  const env = hmacEnvelope(PAYLOAD);
  const tampered: SignedEnvelope = { ...env, payload: { ...PAYLOAD, path: "/etc/passwd" } };
  const result = admitSignedMcpCall(tampered, claim(), { hmacSecret: HMAC_SECRET });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "signature");
    assert.equal(result.code, "signed_envelope_bad_signature");
    assert.equal(result.status, 401);
  }
});

test("rejects when the HMAC secret is missing", () => {
  const result = admitSignedMcpCall(hmacEnvelope(PAYLOAD), claim(), {});
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "signature");
    assert.equal(result.code, "signed_envelope_secret_missing");
  }
});

// --- ed25519 path ----------------------------------------------------------

test("admits a valid ed25519 envelope via the key resolver", () => {
  const { envelope, publicKey } = ed25519Envelope(PAYLOAD);
  const result = admitSignedMcpCall(envelope, claim(), {
    resolveEd25519Key: (keyId) => (keyId === "edge-ed25519" ? publicKey : null),
  });
  assert.equal(result.admitted, true);
  if (result.admitted) {
    assert.deepEqual(result.payload, PAYLOAD);
  }
});

test("rejects an ed25519 envelope when the key_id is unknown", () => {
  const { envelope } = ed25519Envelope(PAYLOAD);
  const result = admitSignedMcpCall(envelope, claim(), { resolveEd25519Key: () => null });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "signature");
    assert.equal(result.code, "signed_envelope_key_unknown");
  }
});

test("rejects an ed25519 envelope signed by a different key", () => {
  const { envelope } = ed25519Envelope(PAYLOAD);
  const other = generateKeyPairSync("ed25519").publicKey;
  const result = admitSignedMcpCall(envelope, claim(), { resolveEd25519Key: () => other });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.code, "signed_envelope_bad_signature");
  }
});

test("rejects an expired ed25519 envelope at the signature stage", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const sig = cryptoSign(null, Buffer.from(canonicalJson(PAYLOAD), "utf8"), privateKey).toString("hex");
  const envelope = createSignedEnvelope({
    id: "env-exp",
    payload_type: "mcp.call",
    payload: PAYLOAD,
    signature: {
      algorithm: "ed25519",
      key_id: "k",
      signature: sig,
      signed_at: "2020-01-01T00:00:00.000Z",
      expires_at: "2020-01-01T00:05:00.000Z",
    },
  });
  const result = admitSignedMcpCall(envelope, claim(), { resolveEd25519Key: () => publicKey });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.code, "signed_envelope_expired");
  }
});

// --- envelope shape --------------------------------------------------------

test("rejects an unsigned / unwrapped value (hostile-by-default)", () => {
  const result = admitSignedMcpCall(PAYLOAD, claim(), { hmacSecret: HMAC_SECRET });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "signature");
    assert.equal(result.code, "signed_envelope_required");
    assert.equal(result.status, 400);
  }
});

test("does not throw on arbitrary untrusted junk", () => {
  for (const junk of [null, undefined, 42, "x", [], { signature: 1 }]) {
    const result = admitSignedMcpCall(junk, claim(), { hmacSecret: HMAC_SECRET });
    assert.equal(result.admitted, false);
  }
});

// --- permission stage (only reached after a valid signature) ---------------

test("denies a signed-but-forbidden tool at the permission stage", () => {
  const denyActor = actor({
    toolRules: [{ toolName: "repo.read", effect: "deny", reason: "tool blocked for this agent" }],
  });
  const result = admitSignedMcpCall(hmacEnvelope(PAYLOAD), claim({ actor: denyActor }), {
    hmacSecret: HMAC_SECRET,
  });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "permission");
    assert.equal(result.code, "mcp_permission_denied");
    assert.equal(result.status, 403);
    assert.match(result.reason, /tool blocked/);
  }
});

test("denies a call to a tool not registered on the server", () => {
  const result = admitSignedMcpCall(hmacEnvelope(PAYLOAD), claim({ toolName: "repo.write" }), {
    hmacSecret: HMAC_SECRET,
  });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "permission");
    assert.match(result.reason, /not registered/);
  }
});

test("denies a call to a disabled MCP server", () => {
  const result = admitSignedMcpCall(
    hmacEnvelope(PAYLOAD),
    claim({ server: server({ enabled: false }) }),
    { hmacSecret: HMAC_SECRET },
  );
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "permission");
    assert.match(result.reason, /disabled/);
  }
});

test("a bad signature is rejected BEFORE the permission check runs", () => {
  // Forbidden tool AND tampered payload: must fail at signature, not permission,
  // proving identity is proven before policy is even consulted.
  const env = hmacEnvelope(PAYLOAD);
  const tampered: SignedEnvelope = { ...env, payload: { ...PAYLOAD, path: "x" } };
  const denyActor = actor({
    toolRules: [{ toolName: "repo.read", effect: "deny" }],
  });
  const result = admitSignedMcpCall(tampered, claim({ actor: denyActor }), { hmacSecret: HMAC_SECRET });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "signature");
  }
});
