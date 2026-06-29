import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateTokens, estimateTokensOfParts } from "./token-estimator";

test("empty / whitespace-only text costs zero tokens", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("   \n\t "), 0);
});

test("estimate is positive and roughly chars/4 for prose", () => {
  const text = "the quick brown fox jumps over the lazy dog"; // 43 chars
  const tokens = estimateTokens(text);
  assert.ok(tokens > 0);
  // Within a sane band of the chars/4 rule of thumb.
  assert.ok(tokens >= 9 && tokens <= 20, `unexpected token estimate: ${tokens}`);
});

test("estimate is deterministic — same input, same count", () => {
  const text = "function add(a, b) { return a + b; }";
  assert.equal(estimateTokens(text), estimateTokens(text));
});

test("estimate is monotonic — more content, more tokens", () => {
  const small = estimateTokens("hello world");
  const big = estimateTokens("hello world ".repeat(50));
  assert.ok(big > small);
});

test("symbol-dense code counts more than length/4 alone (boundary signal)", () => {
  // A short symbol-heavy identifier chain tokenizes into many pieces.
  const code = "a.b.c.d.e().f().g()";
  const byCharsOnly = Math.ceil(code.length / 4);
  assert.ok(
    estimateTokens(code) >= byCharsOnly,
    "symbol boundaries must not undercount vs chars/4",
  );
});

test("estimateTokensOfParts sums parts (never concatenates)", () => {
  const parts = ["alpha beta", "gamma delta", "epsilon"];
  const summed = estimateTokensOfParts(parts);
  const manual =
    estimateTokens(parts[0]) + estimateTokens(parts[1]) + estimateTokens(parts[2]);
  assert.equal(summed, manual);
  assert.equal(estimateTokensOfParts([]), 0);
});
