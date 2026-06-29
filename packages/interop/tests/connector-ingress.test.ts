import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sealConnectorIngress,
  admitConnectorIngress,
  CONNECTOR_INGRESS_PAYLOAD_TYPE,
  type ConnectorIngressPayload,
  type ConnectorIngressClaim,
} from "../src/connector-ingress";
import { testActor, testServer } from "./_helpers";

const HMAC_SECRET = "connector-edge-secret";
const KEY_ID = "telegram-gw-1";

/** A normalized-connector-shaped inbound message (structural superset is fine). */
function inbound(
  overrides: Partial<ConnectorIngressPayload> = {},
): ConnectorIngressPayload {
  return {
    channel: "telegram",
    accountId: "acct-1",
    messageId: "msg-42",
    conversationId: "conv-7",
    text: "read src/index.ts please",
    wasMentioned: true,
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

function claim(overrides: Partial<ConnectorIngressClaim> = {}): ConnectorIngressClaim {
  return {
    server: testServer(),
    toolName: "repo.read",
    actor: testActor(),
    args: { path: "src/index.ts" },
    ...overrides,
  };
}

// --- The happy path: seal a connector message, admit it at the edge ----------

test("admits a sealed connector message whose tool-call is permitted", () => {
  const message = inbound();
  const sealed = sealConnectorIngress({ message, secret: HMAC_SECRET, keyId: KEY_ID });

  assert.equal(sealed.payload_type, CONNECTOR_INGRESS_PAYLOAD_TYPE);
  assert.equal(sealed.signature.algorithm, "hmac-sha256");
  assert.equal(sealed.signature.key_id, KEY_ID);
  assert.equal(sealed.id, "telegram:acct-1:msg-42");

  const result = admitConnectorIngress(sealed, claim(), { hmacSecret: HMAC_SECRET });
  assert.equal(result.admitted, true);
  if (result.admitted) {
    // The verified payload reaches the workspace loop intact.
    assert.deepEqual(result.payload, message);
    assert.equal(result.decision.allowed, true);
    assert.ok(result.decision.policyDecision);
  }
});

// --- Hostile-by-default: tampering is caught at the signature stage ----------

test("rejects a tampered connector payload at the signature stage", () => {
  const sealed = sealConnectorIngress({
    message: inbound(),
    secret: HMAC_SECRET,
    keyId: KEY_ID,
  });
  // An attacker rewrites the text after the gateway signed it.
  const tampered = {
    ...sealed,
    payload: { ...sealed.payload, text: "delete everything" },
  };
  const result = admitConnectorIngress(tampered, claim(), { hmacSecret: HMAC_SECRET });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "signature");
    assert.equal(result.code, "signed_envelope_bad_signature");
    assert.equal(result.status, 401);
  }
});

test("rejects a connector message signed with the wrong secret", () => {
  const sealed = sealConnectorIngress({
    message: inbound(),
    secret: "attacker-secret",
    keyId: KEY_ID,
  });
  const result = admitConnectorIngress(sealed, claim(), { hmacSecret: HMAC_SECRET });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "signature");
    assert.equal(result.code, "signed_envelope_bad_signature");
  }
});

test("rejects an unsigned connector value (never admits raw channel traffic)", () => {
  const result = admitConnectorIngress(inbound(), claim(), { hmacSecret: HMAC_SECRET });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "signature");
    assert.equal(result.code, "signed_envelope_required");
    assert.equal(result.status, 400);
  }
});

// --- Signed-but-forbidden: identity proven, permission denied ----------------

test("rejects a signed connector message whose tool is not on the server", () => {
  const sealed = sealConnectorIngress({
    message: inbound(),
    secret: HMAC_SECRET,
    keyId: KEY_ID,
  });
  const result = admitConnectorIngress(
    sealed,
    claim({ toolName: "repo.write" }),
    { hmacSecret: HMAC_SECRET },
  );
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "permission");
    assert.equal(result.code, "mcp_permission_denied");
    assert.equal(result.status, 403);
  }
});

// --- Expiry is enforced for connector envelopes the same as any A2A envelope --

test("rejects an expired sealed connector message", () => {
  const sealed = sealConnectorIngress({
    message: inbound(),
    secret: HMAC_SECRET,
    keyId: KEY_ID,
    signedAt: new Date("2020-01-01T00:00:00.000Z").toISOString(),
    expiresAt: new Date("2020-01-01T00:05:00.000Z").toISOString(),
  });
  const result = admitConnectorIngress(sealed, claim(), {
    hmacSecret: HMAC_SECRET,
    now: new Date("2020-01-02T00:00:00.000Z"),
  });
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.stage, "signature");
    assert.equal(result.code, "signed_envelope_expired");
  }
});
