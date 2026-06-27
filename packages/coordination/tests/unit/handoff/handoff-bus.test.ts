import { test } from "node:test";
import assert from "node:assert/strict";
import { HandoffBus } from "../../../src/handoff/handoff-bus";
import { encodeEnvelope } from "../../../src/handoff/envelope-codec";
import type { EventBusPort, EventHandler, Unsubscribe } from "../../../src/ports/event-bus";
import type { CoordinationEvent, EventScope, Handoff } from "../../../src/domain";

class FakeBus implements EventBusPort {
  readonly published: CoordinationEvent[] = [];
  async publish(event: CoordinationEvent): Promise<void> {
    this.published.push(event);
  }
  subscribe(_scope: EventScope, _handler: EventHandler): Unsubscribe {
    return () => undefined;
  }
}

function handoff(): Handoff {
  return {
    handoffId: "h1",
    intent: "delegate",
    fromAgentId: "a",
    toAgentId: "b",
    spaceId: "s1",
    targetTaskId: "t-target",
    prompt: "do it",
    status: "initiated",
    depth: 0,
    rootHandoffId: "h1",
    initiatedAt: "2026-06-27T00:00:00.000Z",
  };
}

test("publish emits a handoff.initiated event scoped to space + target task", async () => {
  const bus = new FakeBus();
  const hbus = new HandoffBus(bus);
  const env = encodeEnvelope({ handoff: handoff(), envelopeId: "e1", emittedAt: "t" });
  const result = await hbus.publish({ envelope: env, eventId: "evt1" });
  assert.equal(result.published, true);
  assert.equal(bus.published.length, 1);
  assert.equal(bus.published[0].type, "handoff.initiated");
  assert.deepEqual(bus.published[0].scope, { spaceId: "s1", taskId: "t-target" });
});

test("publish is effectively-once: a duplicate envelope is dropped", async () => {
  const bus = new FakeBus();
  const hbus = new HandoffBus(bus);
  const env = encodeEnvelope({ handoff: handoff(), envelopeId: "e1", emittedAt: "t" });

  const first = await hbus.publish({ envelope: env, eventId: "evt1" });
  const second = await hbus.publish({ envelope: env, eventId: "evt2" });

  assert.equal(first.published, true);
  assert.equal(second.published, false);
  if (!second.published) assert.equal(second.reason, "duplicate");
  assert.equal(bus.published.length, 1); // only the first reached the bus
});

test("seen reports a dedup key after publish", async () => {
  const bus = new FakeBus();
  const hbus = new HandoffBus(bus);
  const env = encodeEnvelope({ handoff: handoff(), envelopeId: "e1", emittedAt: "t" });
  assert.equal(hbus.seen(env.dedupKey), false);
  await hbus.publish({ envelope: env, eventId: "evt1" });
  assert.equal(hbus.seen(env.dedupKey), true);
});
