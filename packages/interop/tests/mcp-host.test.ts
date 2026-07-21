import { test } from "node:test";
import assert from "node:assert/strict";
import { InteropMcpHost, GovernanceDeniedError } from "../src/mcp/host/host";
import type {
  McpToolExecutor,
  McpToolResult,
  McpToolCallInput,
} from "@recoder/agent-mcp";
import type { McpToolAuditEvent } from "../src/mcp/audit/audit";
import { testServer, testActor } from "./_helpers";

/** An executor that records calls so we can prove a denied call never runs it. */
class RecordingExecutor implements McpToolExecutor {
  calls: McpToolCallInput[] = [];
  async call(input: McpToolCallInput): Promise<McpToolResult> {
    this.calls.push(input);
    return { content: { ok: true, tool: input.toolName } };
  }
}

function callInput(overrides: Partial<McpToolCallInput> = {}): McpToolCallInput {
  return {
    server: testServer(),
    toolName: "repo.read",
    actor: testActor(),
    args: { path: "src/index.ts" },
    ...overrides,
  };
}

test("authorize DENIES a tool not registered on the server", () => {
  const host = new InteropMcpHost({ executor: new RecordingExecutor() });
  const decision = host.authorize(callInput({ toolName: "repo.delete" }));
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /not registered/i);
});

test("authorize DENIES a tool the actor's policy denies", () => {
  const host = new InteropMcpHost({ executor: new RecordingExecutor() });
  const actor = testActor({
    toolRules: [{ toolName: "repo.read", effect: "deny", reason: "blocked by policy" }],
  });
  const decision = host.authorize(callInput({ actor }));
  assert.equal(decision.allowed, false);
});

test("authorize DENIES when the server is disabled", () => {
  const host = new InteropMcpHost({ executor: new RecordingExecutor() });
  const decision = host.authorize(callInput({ server: testServer({ enabled: false }) }));
  assert.equal(decision.allowed, false);
});

test("call on a denied tool NEVER reaches the executor and audits the denial", async () => {
  const executor = new RecordingExecutor();
  const audited: McpToolAuditEvent[] = [];
  const host = new InteropMcpHost({
    executor,
    auditSink: { record: (e) => void audited.push(e) },
  });

  const outcome = await host.call(callInput({ toolName: "repo.delete" }));

  assert.equal(outcome.status, "denied");
  assert.equal(executor.calls.length, 0, "executor must not run a denied call");
  assert.equal(audited.length, 1, "a denial must still be audited");
  assert.equal(audited[0]?.call.status, "denied");
});

test("call on an allowed tool executes, returns the result, and audits completion", async () => {
  const executor = new RecordingExecutor();
  const audited: McpToolAuditEvent[] = [];
  const host = new InteropMcpHost({
    executor,
    auditSink: { record: (e) => void audited.push(e) },
  });

  const outcome = await host.call(callInput());

  assert.equal(outcome.status, "completed");
  assert.equal(executor.calls.length, 1);
  if (outcome.status === "completed") {
    assert.deepEqual(outcome.result.content, { ok: true, tool: "repo.read" });
  }
  assert.equal(audited.at(-1)?.call.status, "completed");
});

test("call attaches a risk estimate to the outcome", async () => {
  const host = new InteropMcpHost({ executor: new RecordingExecutor() });
  const outcome = await host.call(callInput());
  assert.ok(["low", "medium", "high"].includes(outcome.risk));
});

test("a throwing audit sink does NOT corrupt a completed call (fail-safe audit)", async () => {
  const host = new InteropMcpHost({
    executor: new RecordingExecutor(),
    auditSink: {
      record: () => {
        throw new Error("audit transport down");
      },
    },
  });
  const outcome = await host.call(callInput());
  assert.equal(outcome.status, "completed");
});

test("GovernanceDeniedError carries the tool name + reason for the wire outcome", () => {
  const err = new GovernanceDeniedError("recoder.beads.beads.create", "forbidden path /etc/shadow");
  assert.equal(err.name, "GovernanceDeniedError");
  assert.equal(err.toolName, "recoder.beads.beads.create");
  assert.equal(err.reason, "forbidden path /etc/shadow");
  assert.match(err.message, /governance denied tool 'recoder\.beads\.beads\.create'/);
  assert.match(err.message, /\/etc\/shadow/);
});

test("a GovernanceDeniedError thrown by the executor (per-tool teeth) maps to a failed + audited wire outcome", async () => {
  // The per-tool teeth live at the injected executor (the backend's
  // `createInteropExecutor`); on a denied verdict it throws GovernanceDeniedError
  // AFTER the gate has already Merkle-sealed the authoritative deny. The interop
  // host catches it like any executor fault and returns the non-`completed`
  // (`'failed'`) wire-audit row — the SECOND record of the documented dual-audit.
  const denying: McpToolExecutor = {
    call: async (input) => {
      throw new GovernanceDeniedError(
        `${input.server.serverId}.${input.toolName}`,
        "forbidden path /etc/shadow",
      );
    },
  };
  const audited: McpToolAuditEvent[] = [];
  const host = new InteropMcpHost({
    executor: denying,
    auditSink: { record: (e) => void audited.push(e) },
  });

  const outcome = await host.call(callInput());

  // Downstream keys on `status !== 'completed'` (documented: a governance deny
  // surfaces here as the `'failed'` wire outcome, not a literal `'denied'`).
  assert.notEqual(outcome.status, "completed");
  if (outcome.status === "failed") assert.match(outcome.reason, /\/etc\/shadow/);
  assert.equal(audited.at(-1)?.call.status, "failed");
  assert.match(String(audited.at(-1)?.error), /governance denied/);
});

test("call on a failing executor reports failed status and audits the failure", async () => {
  const failing: McpToolExecutor = {
    call: async () => {
      throw new Error("tool blew up");
    },
  };
  const audited: McpToolAuditEvent[] = [];
  const host = new InteropMcpHost({
    executor: failing,
    auditSink: { record: (e) => void audited.push(e) },
  });
  const outcome = await host.call(callInput());
  assert.equal(outcome.status, "failed");
  if (outcome.status === "failed") assert.match(outcome.reason, /blew up/);
  assert.equal(audited.at(-1)?.call.status, "failed");
});
