// Run from repo root: node --import tsx --test site/app/api/leads/guards.test.ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  RATE_LIMIT_BURST,
  RATE_LIMIT_MAX_ENTRIES,
  RATE_LIMIT_REFILL_MS,
  clientIpFrom,
  isHoneypotTripped,
  rateLimitSize,
  resetRateLimit,
  takeRateLimitToken,
} from "./guards";

const T0 = 1_754_000_000_000;

describe("takeRateLimitToken", () => {
  beforeEach(() => resetRateLimit());

  it("allows a burst then refuses the next request", () => {
    for (let i = 0; i < RATE_LIMIT_BURST; i++) {
      assert.equal(takeRateLimitToken("1.2.3.4", T0), true);
    }
    assert.equal(takeRateLimitToken("1.2.3.4", T0), false);
  });

  it("refills one token per interval", () => {
    for (let i = 0; i < RATE_LIMIT_BURST; i++) takeRateLimitToken("1.2.3.4", T0);
    assert.equal(takeRateLimitToken("1.2.3.4", T0 + RATE_LIMIT_REFILL_MS - 1), false);
    assert.equal(takeRateLimitToken("1.2.3.4", T0 + RATE_LIMIT_REFILL_MS), true);
    assert.equal(takeRateLimitToken("1.2.3.4", T0 + RATE_LIMIT_REFILL_MS), false);
  });

  it("buckets are per-IP", () => {
    for (let i = 0; i < RATE_LIMIT_BURST; i++) takeRateLimitToken("1.2.3.4", T0);
    assert.equal(takeRateLimitToken("1.2.3.4", T0), false);
    assert.equal(takeRateLimitToken("5.6.7.8", T0), true);
  });

  it("caps at full refill (no token hoarding)", () => {
    takeRateLimitToken("1.2.3.4", T0);
    const later = T0 + 100 * RATE_LIMIT_REFILL_MS;
    for (let i = 0; i < RATE_LIMIT_BURST; i++) {
      assert.equal(takeRateLimitToken("1.2.3.4", later), true);
    }
    assert.equal(takeRateLimitToken("1.2.3.4", later), false);
  });

  it("bounds the map — an IP-cycling attacker evicts itself, not the box", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_ENTRIES + 100; i++) {
      takeRateLimitToken(`10.0.${Math.floor(i / 256)}.${i % 256}`, T0 + i);
    }
    assert.ok(rateLimitSize() <= RATE_LIMIT_MAX_ENTRIES);
  });
});

describe("isHoneypotTripped", () => {
  it("trips only on a non-empty website string", () => {
    assert.equal(isHoneypotTripped({ website: "http://spam.example" }), true);
    assert.equal(isHoneypotTripped({ website: "  " }), false);
    assert.equal(isHoneypotTripped({ website: "" }), false);
    assert.equal(isHoneypotTripped({}), false);
    assert.equal(isHoneypotTripped({ website: 42 }), false);
  });
});

describe("clientIpFrom", () => {
  it("takes the first x-forwarded-for hop", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    assert.equal(clientIpFrom(headers), "203.0.113.9");
  });

  it("falls back to x-real-ip then a shared bucket key", () => {
    assert.equal(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
    assert.equal(clientIpFrom(new Headers()), "unknown");
  });
});
