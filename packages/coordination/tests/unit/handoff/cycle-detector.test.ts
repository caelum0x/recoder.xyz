import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentsInChain,
  assertNoCycle,
  wouldCreateCycle,
} from "../../../src/handoff/cycle-detector";
import { HandoffCycleError } from "../../../src/errors";
import type { DelegationChain } from "../../../src/domain";

function chain(): DelegationChain {
  return {
    rootId: "d0",
    links: [
      { delegationId: "d0", fromAgentId: "a", toAgentId: "b", depth: 0 },
      { delegationId: "d1", fromAgentId: "b", toAgentId: "c", depth: 1 },
    ],
    maxDepth: 1,
    participants: new Set<string>(["a", "b", "c"]),
  };
}

test("agentsInChain collects every endpoint plus participants", () => {
  const agents = agentsInChain(chain());
  assert.deepEqual([...agents].sort(), ["a", "b", "c"]);
});

test("wouldCreateCycle is true when the target is already a participant", () => {
  const agents = agentsInChain(chain());
  assert.equal(wouldCreateCycle(agents, "a"), true);
  assert.equal(wouldCreateCycle(agents, "d"), false);
});

test("assertNoCycle rejects self-delegation", () => {
  assert.throws(
    () => assertNoCycle(new Set<string>(), "a", "a"),
    (e: unknown) => e instanceof HandoffCycleError,
  );
});

test("assertNoCycle rejects delegating back into the chain (A->B->C->A)", () => {
  const agents = agentsInChain(chain());
  assert.throws(
    () => assertNoCycle(agents, "c", "a"),
    (e: unknown) => {
      assert.ok(e instanceof HandoffCycleError);
      assert.equal(e.agentId, "a");
      return true;
    },
  );
});

test("assertNoCycle allows extending to a fresh agent", () => {
  const agents = agentsInChain(chain());
  assert.doesNotThrow(() => assertNoCycle(agents, "c", "d"));
});
