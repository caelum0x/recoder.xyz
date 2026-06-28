import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampRiskTier,
  maxRiskTier,
  parseRiskTier,
  riskTierGt,
  riskTierGte,
  riskTierRank,
} from '../../src/domain/risk-tier';
import {
  classifyTier,
} from '../../src/routing/tier-classifier';

describe('RiskTier ordering', () => {
  it('ranks low < medium < high < critical', () => {
    assert.ok(riskTierRank('low') < riskTierRank('medium'));
    assert.ok(riskTierRank('medium') < riskTierRank('high'));
    assert.ok(riskTierRank('high') < riskTierRank('critical'));
  });

  it('gte/gt comparisons', () => {
    assert.equal(riskTierGte('high', 'high'), true);
    assert.equal(riskTierGte('high', 'critical'), false);
    assert.equal(riskTierGt('critical', 'high'), true);
    assert.equal(riskTierGt('high', 'high'), false);
  });

  it('max takes the more severe tier', () => {
    assert.equal(maxRiskTier('low', 'high'), 'high');
    assert.equal(maxRiskTier('critical', 'medium'), 'critical');
  });

  it('clamp caps at a ceiling', () => {
    assert.equal(clampRiskTier('critical', 'medium'), 'medium');
    assert.equal(clampRiskTier('low', 'high'), 'low');
  });

  it('parse is deny-biased to critical on garbage', () => {
    assert.equal(parseRiskTier('high'), 'high');
    assert.equal(parseRiskTier('garbage'), 'critical');
    assert.equal(parseRiskTier(undefined), 'critical');
  });
});

describe('tier-classifier fusion', () => {
  it('a deny effect forces critical', () => {
    assert.equal(classifyTier({ action: 'file.read', effect: 'deny', complexity: 0 }), 'critical');
  });

  it('needs_approval floors at high', () => {
    assert.equal(classifyTier({ action: 'file.read', effect: 'needs_approval', complexity: 0 }), 'high');
  });

  it('a risky action on a trivial prompt still routes high', () => {
    assert.equal(classifyTier({ action: 'branch.push', effect: 'allow', complexity: 0 }), 'high');
  });

  it('production environment bumps the floor to high', () => {
    assert.equal(classifyTier({ action: 'file.read', effect: 'allow', complexity: 0, environment: 'production' }), 'high');
  });

  it('a simple read with low complexity stays low', () => {
    assert.equal(classifyTier({ action: 'file.read', effect: 'allow', complexity: 0.1 }), 'low');
  });

  it('high complexity raises the tier', () => {
    assert.equal(classifyTier({ action: 'file.read', effect: 'allow', complexity: 0.9 }), 'high');
  });
});
