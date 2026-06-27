import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertDepth,
  isWithinDepth,
  nextDepth,
} from "../../../src/handoff/depth-guard";
import { HandoffDepthExceededError } from "../../../src/errors";

test("nextDepth is 0 for a root (no parent)", () => {
  assert.equal(nextDepth(undefined), 0);
});

test("nextDepth is parentDepth + 1", () => {
  assert.equal(nextDepth(0), 1);
  assert.equal(nextDepth(4), 5);
});

test("isWithinDepth is inclusive of the maximum", () => {
  assert.equal(isWithinDepth(8, 8), true);
  assert.equal(isWithinDepth(9, 8), false);
});

test("assertDepth returns the depth when allowed", () => {
  assert.equal(assertDepth(3, 8), 3);
});

test("assertDepth throws HandoffDepthExceededError past the cap", () => {
  assert.throws(
    () => assertDepth(9, 8),
    (e: unknown) => {
      assert.ok(e instanceof HandoffDepthExceededError);
      assert.equal(e.depth, 9);
      assert.equal(e.maxDepth, 8);
      return true;
    },
  );
});
