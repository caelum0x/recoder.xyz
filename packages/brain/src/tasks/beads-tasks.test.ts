import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBeadsTasks,
  buildReadyArgs,
  buildUpdateArgs,
} from "../tasks/beads-tasks";
import type { BeadsExec } from "../tasks/beads-tasks";

test("related maps bd ready issues to BrainTask incl deps/blocks", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const exec: BeadsExec = async (command, args) => {
    calls.push({ command, args });
    return JSON.stringify([
      {
        id: "recoder-d6bg",
        title: "Sweep references to removed legacy surfaces",
        status: "open",
        dependencies: [{ id: "recoder-9eph" }, { id: "recoder-aaa1" }],
        dependents: [{ id: "recoder-zzz9" }],
      },
      {
        id: "recoder-x1",
        title: "No deps",
        status: "in_progress",
      },
    ]);
  };

  const tasks = createBeadsTasks({ exec });
  const rows = await tasks.related("legacy", 5);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    id: "recoder-d6bg",
    title: "Sweep references to removed legacy surfaces",
    status: "open",
    dependsOn: ["recoder-9eph", "recoder-aaa1"],
    blocks: ["recoder-zzz9"],
  });
  // No-dep issue omits dependsOn/blocks entirely (immutable, sparse shape).
  assert.deepEqual(rows[1], {
    id: "recoder-x1",
    title: "No deps",
    status: "in_progress",
  });
  // Shelled the real ready-work query.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "bd");
  assert.deepEqual(calls[0].args, ["ready", "--json", "--limit", "5"]);
});

test("related accepts the plain id-array dependency shape", async () => {
  const exec: BeadsExec = async () =>
    JSON.stringify([
      {
        id: "bd-1",
        title: "step",
        status: "open",
        depends_on: ["bd-0"],
        blocks: ["bd-2", "bd-3"],
      },
    ]);
  const rows = await createBeadsTasks({ exec }).related("x", 3);
  assert.deepEqual(rows[0], {
    id: "bd-1",
    title: "step",
    status: "open",
    dependsOn: ["bd-0"],
    blocks: ["bd-2", "bd-3"],
  });
});

test("buildReadyArgs clamps non-positive/NaN limits to the bd default", () => {
  assert.deepEqual(buildReadyArgs(0), ["ready", "--json", "--limit", "10"]);
  assert.deepEqual(buildReadyArgs(-4), ["ready", "--json", "--limit", "10"]);
  assert.deepEqual(buildReadyArgs(7), ["ready", "--json", "--limit", "7"]);
});

test("update builds bd update argv for a non-terminal status", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const exec: BeadsExec = async (command, args) => {
    calls.push({ command, args });
    return "[]";
  };
  await createBeadsTasks({ exec }).update("bd-1", "in_progress", "claimed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "bd");
  assert.deepEqual(calls[0].args, [
    "update",
    "bd-1",
    "--status",
    "in_progress",
    "--notes",
    "claimed",
    "--json",
  ]);
});

test("update routes terminal statuses through bd close", async () => {
  const calls: string[][] = [];
  const exec: BeadsExec = async (_command, args) => {
    calls.push(args);
    return "[]";
  };
  const tasks = createBeadsTasks({ exec });
  await tasks.update("bd-1", "closed", "shipped");
  await tasks.update("bd-2", "done");
  assert.deepEqual(calls[0], ["close", "bd-1", "--reason", "shipped", "--json"]);
  assert.deepEqual(calls[1], ["close", "bd-2", "--json"]);
});

test("buildUpdateArgs is the asserted argv seam", () => {
  assert.deepEqual(buildUpdateArgs("id", "open"), [
    "update",
    "id",
    "--status",
    "open",
    "--json",
  ]);
  assert.deepEqual(buildUpdateArgs("id", "DONE"), ["close", "id", "--json"]);
});

test("related degrades to [] when the injected exec throws", async () => {
  const exec: BeadsExec = async () => {
    throw new Error("bd not installed");
  };
  assert.deepEqual(await createBeadsTasks({ exec }).related("x", 3), []);
});

test("related degrades to [] on non-JSON / non-array output", async () => {
  const garbage: BeadsExec = async () => "not json";
  assert.deepEqual(await createBeadsTasks({ exec: garbage }).related("x", 1), []);
  const notArray: BeadsExec = async () => JSON.stringify({ oops: true });
  assert.deepEqual(
    await createBeadsTasks({ exec: notArray }).related("x", 1),
    [],
  );
});

test("update is a silent no-op when exec throws (never rejects)", async () => {
  const exec: BeadsExec = async () => {
    throw new Error("ENOENT bd");
  };
  await assert.doesNotReject(
    createBeadsTasks({ exec }).update("bd-1", "closed"),
  );
});

test("update skips exec entirely on empty id or status", async () => {
  let called = 0;
  const exec: BeadsExec = async () => {
    called += 1;
    return "[]";
  };
  const tasks = createBeadsTasks({ exec });
  await tasks.update("", "open");
  await tasks.update("bd-1", "");
  assert.equal(called, 0);
});
