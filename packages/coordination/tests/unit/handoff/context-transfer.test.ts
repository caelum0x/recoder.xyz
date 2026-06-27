import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planContextTransfer,
  transferContext,
  type ContextEntry,
  type ContextTransferPort,
} from "../../../src/handoff/context-transfer";

const entries: ContextEntry[] = [
  { id: "c1", type: "metadata", data: { a: 1 }, sizeBytes: 100 },
  { id: "c2", type: "conversation_history", data: ["hi"], sizeBytes: 200 },
];

test("planContextTransfer is a no-op for the same task", () => {
  const plan = planContextTransfer({ fromTaskId: "t", toTaskId: "t", sourceEntries: entries, destCurrentBytes: 0 });
  assert.deepEqual(plan, { kind: "noop", reason: "same-task" });
});

test("planContextTransfer is a no-op for an empty source", () => {
  const plan = planContextTransfer({ fromTaskId: "t1", toTaskId: "t2", sourceEntries: [], destCurrentBytes: 0 });
  assert.deepEqual(plan, { kind: "noop", reason: "empty-source" });
});

test("planContextTransfer rejects when the size ceiling would be exceeded", () => {
  const plan = planContextTransfer({
    fromTaskId: "t1",
    toTaskId: "t2",
    sourceEntries: entries,
    destCurrentBytes: 50,
    maxBytes: 200,
  });
  assert.equal(plan.kind, "rejected");
  if (plan.kind === "rejected") {
    assert.equal(plan.wouldBe, 350);
    assert.equal(plan.limit, 200);
  }
});

test("planContextTransfer transfers all entries when within budget", () => {
  const plan = planContextTransfer({ fromTaskId: "t1", toTaskId: "t2", sourceEntries: entries, destCurrentBytes: 0 });
  assert.equal(plan.kind, "transfer");
  if (plan.kind === "transfer") {
    assert.equal(plan.entries.length, 2);
    assert.equal(plan.totalBytes, 300);
  }
});

class FakePort implements ContextTransferPort {
  readonly written: Array<{ taskId: string; entry: ContextEntry }> = [];
  constructor(
    private readonly source: ContextEntry[],
    private readonly destBytes: number,
    private readonly throwOnGet = false,
  ) {}
  async getAll(): Promise<ContextEntry[]> {
    if (this.throwOnGet) throw new Error("store down");
    return this.source;
  }
  async totalSize(): Promise<number> {
    return this.destBytes;
  }
  async put(taskId: string, entry: ContextEntry): Promise<void> {
    this.written.push({ taskId, entry });
  }
}

test("transferContext copies every entry with a fresh id, source intact", async () => {
  const port = new FakePort(entries, 0);
  const outcome = await transferContext(port, "t1", "t2", "2026-06-27T00:00:00.000Z");
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.result.entriesTransferred, 2);
    assert.equal(outcome.result.totalBytes, 300);
  }
  assert.equal(port.written.length, 2);
  assert.equal(port.written[0].entry.id, "c1:t2");
});

test("transferContext degrades (never throws) when the store errors", async () => {
  const port = new FakePort(entries, 0, true);
  const outcome = await transferContext(port, "t1", "t2", "t");
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.degraded.reason, "error");
  }
});

test("transferContext degrades on a size-exceeded plan", async () => {
  const port = new FakePort(entries, 1000);
  const outcome = await transferContext(port, "t1", "t2", "t", 500);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.degraded.reason, "size-exceeded");
  }
});
