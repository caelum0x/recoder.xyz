import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSemVer, compareSemVer, formatSemVer, requireSemVer } from '../../src/domain/semver';
import { planSatisfies, planHasFeature } from '../../src/domain/subscription-plan';
import { quotaHasHeadroom, consumeQuota } from '../../src/domain/quota';
import { ChannelHealthSchema, unhealthy, healthy } from '../../src/domain/health-state';
import { requiresApproval } from '../../src/domain/channel';
import { loadDistributionConfig } from '../../src/config/index';

test('semver parses, compares, and round-trips', () => {
  assert.equal(parseSemVer('not-a-version'), null);
  const a = requireSemVer('v2.5.4');
  assert.equal(a.major, 2);
  assert.equal(formatSemVer(a), '2.5.4');
  assert.equal(compareSemVer(requireSemVer('2.6.0'), requireSemVer('2.5.4')), 1);
  assert.equal(compareSemVer(requireSemVer('1.0.0'), requireSemVer('1.0.0')), 0);
  // prerelease is lower precedence than the release core.
  assert.equal(compareSemVer(requireSemVer('1.0.0-rc.1'), requireSemVer('1.0.0')), -1);
});

test('plan ordering and feature matrix', () => {
  assert.equal(planSatisfies('enterprise', 'pro'), true);
  assert.equal(planSatisfies('free', 'pro'), false);
  assert.equal(planHasFeature('pro', 'custom_domain'), true);
  assert.equal(planHasFeature('free', 'custom_domain'), false);
  assert.equal(planHasFeature('enterprise', 'desktop_signed_build'), true);
});

test('quota headroom + immutable consume', () => {
  const q = { subjectId: 'u', kind: 'cli_request' as const, limit: 10, remaining: 2, resetAt: 'x' };
  assert.equal(quotaHasHeadroom(q, 1), true);
  assert.equal(quotaHasHeadroom(q, 3), false);
  const after = consumeQuota(q, 2);
  assert.equal(after.remaining, 0);
  assert.equal(q.remaining, 2, 'original is not mutated');
  // limit=0 means unlimited → always headroom, never decrements.
  const unlimited = { ...q, limit: 0, remaining: 0 };
  assert.equal(quotaHasHeadroom(unlimited, 5), true);
});

test('ChannelHealth schema requires a reason on non-ok states', () => {
  assert.equal(ChannelHealthSchema.safeParse(healthy()).success, true);
  assert.equal(ChannelHealthSchema.safeParse(unhealthy('missing key')).success, true);
  const bad = ChannelHealthSchema.safeParse({ status: 'unhealthy', checkedAt: 'now' });
  assert.equal(bad.success, false, 'non-ok without a reason must be rejected');
});

test('customer-visible channels require approval; preview/download do not', () => {
  assert.equal(requiresApproval('npm'), true);
  assert.equal(requiresApproval('web_site'), true);
  assert.equal(requiresApproval('homebrew'), true);
  assert.equal(requiresApproval('preview'), false);
  assert.equal(requiresApproval('download'), false);
});

test('config fails fast without recoder.xyz base URL (no localhost fallback)', () => {
  assert.throws(() => loadDistributionConfig({}), /RECODER_BASE_URL is required/);
  const cfg = loadDistributionConfig({ RECODER_BASE_URL: 'https://recoder.xyz' });
  assert.equal(cfg.recoderBaseUrl, 'https://recoder.xyz');
  assert.equal(cfg.cliClientId, 'recoder-code');
});
