import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectUserVisibleFailureText,
  deriveLaunchOutcome,
  deriveReviewMergeResult,
  redactSecrets,
  runtimeLabel,
} from "./private-beta-run-artifact-lib";

describe("redactSecrets", () => {
  it("redacts common token formats", () => {
    const text =
      "Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz ghp_1234567890abcdef123456 xoxb-123456789012-abcdefghijkl";
    const redacted = redactSecrets(text);
    assert.equal(redacted.includes("sk-abcdefghijklmnopqrstuvwxyz"), false);
    assert.equal(redacted.includes("ghp_1234567890abcdef123456"), false);
    assert.equal(redacted.includes("xoxb-123456789012-abcdefghijkl"), false);
    assert.match(redacted, /\[REDACTED_SECRET\]/);
  });

  it("redacts credential pairs in URLs and env-like text", () => {
    const text = "OPENAI_API_KEY=abc1234567890123 https://user:pass@example.test/path";
    const redacted = redactSecrets(text);
    assert.equal(redacted.includes("abc1234567890123"), false);
    assert.equal(redacted.includes("user:pass"), false);
    assert.match(redacted, /OPENAI_API_KEY=\[REDACTED_SECRET\]/);
  });
});

describe("deriveLaunchOutcome", () => {
  it("treats a running workspace as a successful launch", () => {
    assert.deepEqual(deriveLaunchOutcome({ state: "running" }), { outcome: "succeeded" });
  });

  it("treats a failed workspace with metadata.error as a failed launch", () => {
    assert.deepEqual(deriveLaunchOutcome({ state: "failed", metadata: { error: "repo init failed" } }), {
      outcome: "failed",
      reason: "repo init failed",
    });
  });
});

describe("deriveReviewMergeResult", () => {
  it("prefers merged evidence over intermediate states", () => {
    assert.equal(
      deriveReviewMergeResult({ state: "running" }, { verdict: "blocked" }, { evidence: { contentHash: "abc" } }),
      "merged"
    );
  });

  it("maps awaiting_review to ready_for_review", () => {
    assert.equal(deriveReviewMergeResult({ state: "awaiting_review" }, null, null), "ready_for_review");
  });
});

describe("collectUserVisibleFailureText", () => {
  it("dedupes and redacts the visible failures", () => {
    const lines = collectUserVisibleFailureText({
      workspace: {
        state: "failed",
        metadata: {
          error: "launch failed with sk-abcdefghijklmnopqrstuvwxyz",
          mergeError: "launch failed with sk-abcdefghijklmnopqrstuvwxyz",
        },
      },
      launch: { outcome: "failed", reason: "launch failed with sk-abcdefghijklmnopqrstuvwxyz" },
      readiness: {
        blockers: ["checks failing"],
        signals: [{ id: "checks", status: "fail", detail: "2 checks failing" }],
      },
      previewVerification: { status: "failed", summary: "Bearer sk-abcdefghijklmnopqrstuvwxyz" },
      endpointErrors: { health: "OPENAI_API_KEY=abc1234567890123" },
      events: [{ type: "failed", message: "ghp_1234567890abcdef123456" }],
    });
    assert.equal(lines.length >= 4, true);
    assert.equal(lines.some((line) => line.includes("sk-abcdefghijklmnopqrstuvwxyz")), false);
    assert.equal(lines.some((line) => line.includes("ghp_1234567890abcdef123456")), false);
    assert.equal(lines.some((line) => line.includes("abc1234567890123")), false);
  });
});

describe("runtimeLabel", () => {
  it("maps known ids and title-cases unknown ids", () => {
    assert.equal(runtimeLabel("claude_code"), "Claude Code");
    assert.equal(runtimeLabel("custom_agent"), "Custom Agent");
  });
});
