import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extendChain,
  isChainAtCapacity,
  projectedNextDepth,
  startChain,
} from "../../../src/handoff/delegation-chain-service";
import {
  HandoffCycleError,
  HandoffDepthExceededError,
} from "../../../src/errors";

test("startChain creates a depth-0 root with both participants", () => {
  const chain = startChain({ rootId: "d0", fromAgentId: "a", toAgentId: "b", maxDepth: 8 });
  assert.equal(chain.rootId, "d0");
  assert.equal(chain.maxDepth, 0);
  assert.equal(chain.links.length, 1);
  assert.deepEqual([...chain.participants].sort(), ["a", "b"]);
});

test("startChain rejects a self-delegating root", () => {
  assert.throws(
    () => startChain({ rootId: "d0", fromAgentId: "a", toAgentId: "a", maxDepth: 8 }),
    (e: unknown) => e instanceof HandoffCycleError,
  );
});

test("extendChain appends a link at the next depth, immutably", () => {
  const root = startChain({ rootId: "d0", fromAgentId: "a", toAgentId: "b", maxDepth: 8 });
  const extended = extendChain(root, { delegationId: "d1", fromAgentId: "b", toAgentId: "c", maxDepth: 8 });

  assert.equal(extended.maxDepth, 1);
  assert.equal(extended.links.length, 2);
  assert.deepEqual([...extended.participants].sort(), ["a", "b", "c"]);
  // Original chain is untouched (immutability).
  assert.equal(root.links.length, 1);
  assert.equal(root.maxDepth, 0);
});

test("extendChain rejects a cycle back into the chain", () => {
  const root = startChain({ rootId: "d0", fromAgentId: "a", toAgentId: "b", maxDepth: 8 });
  const c = extendChain(root, { delegationId: "d1", fromAgentId: "b", toAgentId: "c", maxDepth: 8 });
  assert.throws(
    () => extendChain(c, { delegationId: "d2", fromAgentId: "c", toAgentId: "a", maxDepth: 8 }),
    (e: unknown) => e instanceof HandoffCycleError,
  );
});

test("extendChain enforces the depth cap", () => {
  let chain = startChain({ rootId: "d0", fromAgentId: "a0", toAgentId: "a1", maxDepth: 2 });
  chain = extendChain(chain, { delegationId: "d1", fromAgentId: "a1", toAgentId: "a2", maxDepth: 2 });
  chain = extendChain(chain, { delegationId: "d2", fromAgentId: "a2", toAgentId: "a3", maxDepth: 2 });
  assert.equal(chain.maxDepth, 2);
  assert.equal(isChainAtCapacity(chain, 2), true);
  assert.throws(
    () => extendChain(chain, { delegationId: "d3", fromAgentId: "a3", toAgentId: "a4", maxDepth: 2 }),
    (e: unknown) => e instanceof HandoffDepthExceededError,
  );
});

test("projectedNextDepth reports the depth a child would occupy", () => {
  const root = startChain({ rootId: "d0", fromAgentId: "a", toAgentId: "b", maxDepth: 8 });
  assert.equal(projectedNextDepth(root), 1);
});
