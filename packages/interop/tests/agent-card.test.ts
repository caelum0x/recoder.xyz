import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentCard,
  serializeAgentCard,
  AGENT_CARD_WELL_KNOWN_PATH,
  SIGNED_ENVELOPE_SECURITY_SCHEME,
} from "../src/a2a/agent-card/builder";

test("buildAgentCard produces a deterministic, sorted card", () => {
  const card = buildAgentCard({
    id: "agent-recoder",
    name: "Recoder Agent",
    platform: "recoder",
    capabilities: ["review", "implementation", "review"], // dup + unsorted
    skills: [
      { id: "b-skill", name: "B" },
      { id: "a-skill", name: "A" },
    ],
  });
  assert.deepEqual(card.capabilities, ["implementation", "review"]);
  assert.deepEqual(card.skills.map((s) => s.id), ["a-skill", "b-skill"]);
});

test("buildAgentCard ALWAYS advertises the mandatory signed-envelope scheme", () => {
  const card = buildAgentCard({
    id: "a",
    name: "A",
    platform: "recoder",
    capabilities: [],
    skills: [],
  });
  assert.ok(card.securitySchemes);
  assert.deepEqual(card.securitySchemes?.signed_envelope, SIGNED_ENVELOPE_SECURITY_SCHEME);
});

test("extraSecuritySchemes cannot shadow the mandatory signed-envelope scheme", () => {
  const card = buildAgentCard({
    id: "a",
    name: "A",
    platform: "recoder",
    capabilities: [],
    skills: [],
    extraSecuritySchemes: {
      // An attacker-supplied override that tries to weaken the advertised auth.
      signed_envelope: { type: "api_key", description: "weakened" },
      bearer: { type: "bearer" },
    },
  });
  // The mandatory scheme wins; the extra bearer scheme is preserved.
  assert.deepEqual(card.securitySchemes?.signed_envelope, SIGNED_ENVELOPE_SECURITY_SCHEME);
  assert.equal(card.securitySchemes?.bearer?.type, "bearer");
});

test("serializeAgentCard yields parseable JSON matching the card", () => {
  const card = buildAgentCard({
    id: "a",
    name: "A",
    platform: "recoder",
    capabilities: ["x"],
    skills: [{ id: "s", name: "S" }],
    version: "1.2.3",
  });
  const json = serializeAgentCard(card);
  const parsed = JSON.parse(json);
  assert.equal(parsed.id, "a");
  assert.equal(parsed.version, "1.2.3");
  assert.deepEqual(parsed.capabilities, ["x"]);
});

test("the well-known path is the A2A discovery path", () => {
  assert.equal(AGENT_CARD_WELL_KNOWN_PATH, "/.well-known/agent.json");
});
