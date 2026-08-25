// Run from repo root: node --import tsx --test site/app/api/pilots/store.test.ts
//
// These are the public-proof credibility guarantees: the /proof funnel shows
// prospects real, cohort-protected pilot numbers. A regression here would either
// leak an under-sized cohort, miscount met/missed outcomes, or accept an internal
// URL as public proof — so the aggregate math and the public-URL guard are pinned.
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createPilotRecord,
  updatePilotRecord,
  readPilotAggregate,
  isPublicHttpUrl,
} from "./store";

// Each test gets an isolated data dir; pilotDataDir() re-reads the env per call.
beforeEach(async () => {
  process.env.PILOTS_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "recoder-pilots-test-"));
});

async function verifiedPilot(lead: string, direction: "increase" | "decrease" | "exact", baseline: number, target: number, outcome: number): Promise<void> {
  const pilot = await createPilotRecord({
    designPartnerLeadId: lead,
    metricName: "cycle time",
    metricUnit: "minutes",
    metricDirection: direction,
    baselineValue: baseline,
    targetValue: target,
  });
  await updatePilotRecord(pilot.id, { status: "completed", outcomeValue: outcome });
  await updatePilotRecord(pilot.id, { status: "verified", proofUrl: `https://proof.acme.dev/${lead}` });
}

describe("readPilotAggregate — cohort protection", () => {
  it("withholds the outcome breakdown below the minimum cohort", async () => {
    await verifiedPilot("L1", "decrease", 100, 50, 40);
    await verifiedPilot("L2", "decrease", 100, 50, 40);

    const aggregate = await readPilotAggregate();
    assert.equal(aggregate.verifiedOutcomes, 2);
    assert.equal(aggregate.minimumOutcomeCohort, 3);
    assert.equal(aggregate.targetMet, null);
    assert.equal(aggregate.targetMissed, null);
    assert.equal(aggregate.targetMetRatePercent, null);
  });

  it("reveals a rounded met-rate once the cohort is reached", async () => {
    await verifiedPilot("L1", "decrease", 100, 50, 40); // met
    await verifiedPilot("L2", "decrease", 100, 50, 45); // met
    await verifiedPilot("L3", "decrease", 100, 50, 60); // missed

    const aggregate = await readPilotAggregate();
    assert.equal(aggregate.verifiedOutcomes, 3);
    assert.equal(aggregate.targetMet, 2);
    assert.equal(aggregate.targetMissed, 1);
    assert.equal(aggregate.targetMetRatePercent, 67); // Math.round(2/3*100)
  });

  it("scores each metric direction against its target", async () => {
    await verifiedPilot("inc", "increase", 10, 20, 25); // met (>=)
    await verifiedPilot("dec", "decrease", 100, 50, 40); // met (<=)
    await verifiedPilot("exact-miss", "exact", 0, 42, 41); // missed (!==)

    const aggregate = await readPilotAggregate();
    assert.equal(aggregate.targetMet, 2);
    assert.equal(aggregate.targetMissed, 1);
  });

  it("counts the funnel independently of the outcome breakdown", async () => {
    const started = await createPilotRecord({
      designPartnerLeadId: "started-only",
      metricName: "cycle time",
      metricUnit: "minutes",
      metricDirection: "decrease",
      baselineValue: 100,
      targetValue: 50,
    });
    await updatePilotRecord(started.id, { status: "cancelled" });
    await verifiedPilot("v1", "decrease", 100, 50, 40);

    const aggregate = await readPilotAggregate();
    assert.equal(aggregate.startedPilots, 2);
    assert.equal(aggregate.activePilots, 0);
    assert.equal(aggregate.completedPilots, 1); // verified counts as completed
    assert.equal(aggregate.verifiedOutcomes, 1);
  });
});

describe("updatePilotRecord — lifecycle invariants", () => {
  it("rejects a skipped transition (started → verified)", async () => {
    const pilot = await createPilotRecord({
      designPartnerLeadId: "L", metricName: "m", metricUnit: "s",
      metricDirection: "decrease", baselineValue: 100, targetValue: 50,
    });
    await assert.rejects(
      () => updatePilotRecord(pilot.id, { status: "verified", outcomeValue: 40, proofUrl: "https://proof.acme.dev/L" }),
      /cannot move from started to verified/,
    );
  });

  it("rejects edits to a terminal pilot", async () => {
    await verifiedPilot("L", "decrease", 100, 50, 40);
    const [record] = await (await import("./store")).readAdminPilotRecords();
    await assert.rejects(
      () => updatePilotRecord(record.id, { metricName: "changed" }),
      /terminal/,
    );
  });

  it("refuses to verify without a public proof URL", async () => {
    const pilot = await createPilotRecord({
      designPartnerLeadId: "L", metricName: "m", metricUnit: "s",
      metricDirection: "decrease", baselineValue: 100, targetValue: 50,
    });
    await updatePilotRecord(pilot.id, { status: "completed", outcomeValue: 40 });
    await assert.rejects(
      () => updatePilotRecord(pilot.id, { status: "verified", proofUrl: "http://127.0.0.1/proof" }),
      /public HTTP\(S\) proof URL/,
    );
  });

  it("requires an outcome before completion", async () => {
    const pilot = await createPilotRecord({
      designPartnerLeadId: "L", metricName: "m", metricUnit: "s",
      metricDirection: "decrease", baselineValue: 100, targetValue: 50,
    });
    await assert.rejects(
      () => updatePilotRecord(pilot.id, { status: "completed" }),
      /requires an outcome/,
    );
  });
});

describe("isPublicHttpUrl — proof-link SSRF guard", () => {
  it("accepts a real public HTTP(S) URL", () => {
    assert.equal(isPublicHttpUrl("https://acme.dev/proof"), true);
    assert.equal(isPublicHttpUrl("http://blog.example.com/p"), true); // example.com is a real registrable domain
  });

  it("rejects non-HTTP protocols and embedded credentials", () => {
    assert.equal(isPublicHttpUrl("ftp://acme.dev/proof"), false);
    assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
    assert.equal(isPublicHttpUrl("https://user:pass@acme.dev/proof"), false);
    assert.equal(isPublicHttpUrl("not a url"), false);
  });

  it("rejects loopback, link-local and internal names", () => {
    assert.equal(isPublicHttpUrl("http://localhost/x"), false);
    assert.equal(isPublicHttpUrl("http://build.internal/x"), false);
    assert.equal(isPublicHttpUrl("http://box.local/x"), false);
    assert.equal(isPublicHttpUrl("http://demo.test/x"), false);
  });

  it("rejects private and reserved IPv4 ranges", () => {
    assert.equal(isPublicHttpUrl("http://127.0.0.1/x"), false);
    assert.equal(isPublicHttpUrl("http://10.0.0.5/x"), false);
    assert.equal(isPublicHttpUrl("http://192.168.1.10/x"), false);
    assert.equal(isPublicHttpUrl("http://172.16.4.4/x"), false);
    assert.equal(isPublicHttpUrl("http://169.254.169.254/latest/meta-data"), false); // cloud metadata
    assert.equal(isPublicHttpUrl("http://8.8.8.8/x"), true); // public IP is allowed
  });

  it("rejects reserved IPv6 including mapped IPv4", () => {
    assert.equal(isPublicHttpUrl("http://[::1]/x"), false);
    assert.equal(isPublicHttpUrl("http://[fe80::1]/x"), false);
    assert.equal(isPublicHttpUrl("http://[fd00::1]/x"), false);
    // URL canonicalises ::ffff:127.0.0.1 to hex (::ffff:7f00:1) — the guard must
    // still decode the embedded IPv4 rather than treat it as a public host.
    assert.equal(isPublicHttpUrl("http://[::ffff:127.0.0.1]/x"), false);
    assert.equal(isPublicHttpUrl("http://[::ffff:10.0.0.1]/x"), false);
    assert.equal(isPublicHttpUrl("http://[::ffff:169.254.169.254]/x"), false); // mapped cloud metadata
    assert.equal(isPublicHttpUrl("http://[::ffff:8.8.8.8]/x"), true); // mapped public IP stays public
    // IPv4-compatible IPv6 (::a.b.c.d) canonicalises to bare hex (::HHHH:HHHH)
    // with no ffff: prefix — the guard must decode it too or an internal host
    // tunnels past the denylist. ::a9fe:a9fe = ::169.254.169.254 (metadata),
    // ::7f00:1 = ::127.0.0.1 (loopback), ::a00:1 = ::10.0.0.1 (private).
    assert.equal(isPublicHttpUrl("http://[::a9fe:a9fe]/x"), false);
    assert.equal(isPublicHttpUrl("http://[::7f00:1]/x"), false);
    assert.equal(isPublicHttpUrl("http://[::a00:1]/x"), false);
  });
});
