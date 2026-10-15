import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMPARISONS, comparison } from "./comparisons";

describe("comparisons data", () => {
  it("has at least one entry", () => {
    assert.ok(COMPARISONS.length >= 1);
  });

  it("has unique slugs", () => {
    const slugs = COMPARISONS.map((c) => c.slug);
    assert.deepEqual(slugs, [...new Set(slugs)]);
  });

  it("resolves every entry by slug via the comparison() helper", () => {
    for (const c of COMPARISONS) {
      assert.equal(comparison(c.slug)?.title, c.title);
    }
  });

  it("returns undefined for an unknown slug", () => {
    assert.equal(comparison("not-a-real-comparison"), undefined);
  });

  it("only cross-links to related slugs that actually exist", () => {
    const knownSlugs = new Set(COMPARISONS.map((c) => c.slug));
    for (const c of COMPARISONS) {
      for (const relatedSlug of c.related) {
        assert.ok(
          knownSlugs.has(relatedSlug),
          `${c.slug} links to unknown related slug "${relatedSlug}"`,
        );
      }
      // A page should never link to itself as "related".
      assert.ok(!c.related.includes(c.slug), `${c.slug} lists itself as related`);
    }
  });

  it("keeps every feature-matrix row the same width as the header", () => {
    for (const c of COMPARISONS) {
      for (const row of c.table.rows) {
        assert.equal(
          row.length,
          c.table.head.length,
          `${c.slug}: table row "${row[0]}" has ${row.length} cells, header has ${c.table.head.length}`,
        );
      }
    }
  });

  it("has a non-empty intro, pros/cons, when-to-use, recoderFit, and FAQ for every entry", () => {
    for (const c of COMPARISONS) {
      assert.ok(c.intro.length > 0, `${c.slug}: missing intro`);
      assert.ok(c.prosA.length > 0, `${c.slug}: missing prosA`);
      assert.ok(c.consA.length > 0, `${c.slug}: missing consA`);
      assert.ok(c.prosB.length > 0, `${c.slug}: missing prosB`);
      assert.ok(c.consB.length > 0, `${c.slug}: missing consB`);
      assert.ok(c.whenA.length > 0, `${c.slug}: missing whenA`);
      assert.ok(c.whenB.length > 0, `${c.slug}: missing whenB`);
      assert.ok(c.recoderFit.length > 0, `${c.slug}: missing recoderFit`);
      assert.ok(c.faq.length > 0, `${c.slug}: missing faq`);
    }
  });

  it("keeps meta descriptions within the SERP display budget (~160 chars)", () => {
    for (const c of COMPARISONS) {
      assert.ok(
        c.description.length <= 170,
        `${c.slug}: description is ${c.description.length} chars, want <=170`,
      );
    }
  });

  it("names Recoder as one side of every comparison", () => {
    for (const c of COMPARISONS) {
      assert.ok(
        c.a.name === "Recoder" || c.b.name === "Recoder",
        `${c.slug}: neither side is Recoder`,
      );
    }
  });
});
