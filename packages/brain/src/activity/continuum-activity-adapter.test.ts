import { test } from "node:test";
import assert from "node:assert/strict";
import { createContinuumActivity } from "../activity/continuum-activity-adapter";
import type { ActivityExec } from "../activity/continuum-activity-adapter";

test("recall maps continuum rows to BrainActivity", async () => {
  const exec: ActivityExec = async () =>
    JSON.stringify([
      {
        when: "2026-06-26T09:00:00Z",
        app: "VS Code",
        who: "you",
        type: "edit",
        text: "wired the activity port",
        id: "r1",
      },
      {
        when: "2026-06-26T09:05:00Z",
        app: "Mail",
        who: "others",
        type: "message",
        text: "review request",
        id: "r2",
      },
    ]);

  const activity = createContinuumActivity({ exec });
  const rows = await activity.recall("brain", 5);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    when: "2026-06-26T09:00:00Z",
    app: "VS Code",
    who: "you",
    type: "edit",
    text: "wired the activity port",
    id: "r1",
  });
  assert.equal(rows[1].who, "others");
});

test("profile maps continuum types -> tools and keeps brief", async () => {
  const exec: ActivityExec = async () =>
    JSON.stringify({
      kind: "engineer",
      brief: "async, deep-work mornings",
      apps: ["VS Code", "Slack"],
      types: ["edit", "message"],
      recurring: ["standup 9am"],
    });

  const activity = createContinuumActivity({ exec });
  const profile = await activity.profile();

  assert.ok(profile);
  assert.equal(profile?.kind, "engineer");
  assert.equal(profile?.brief, "async, deep-work mornings");
  assert.deepEqual(profile?.tools, ["edit", "message"]);
  assert.deepEqual(profile?.recurring, ["standup 9am"]);
});

test("recall degrades to [] when the injected exec throws", async () => {
  const exec: ActivityExec = async () => {
    throw new Error("continuum not installed");
  };
  const activity = createContinuumActivity({ exec });
  assert.deepEqual(await activity.recall("anything", 3), []);
});

test("profile degrades to null when the injected exec throws", async () => {
  const exec: ActivityExec = async () => {
    throw new Error("ENOENT continuum");
  };
  const activity = createContinuumActivity({ exec });
  assert.equal(await activity.profile(), null);
});

test("recall degrades to [] on non-JSON / non-array output", async () => {
  const garbage: ActivityExec = async () => "not json at all";
  assert.deepEqual(await createContinuumActivity({ exec: garbage }).recall("x", 1), []);

  const notArray: ActivityExec = async () => JSON.stringify({ oops: true });
  assert.deepEqual(
    await createContinuumActivity({ exec: notArray }).recall("x", 1),
    [],
  );
});
