import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreCapabilities,
  matchCapabilities,
  determineTier,
  platformMatches,
} from '../../../src/dispatch/capability-matcher';

test('full required match scores 60 base + tier bonus (tier-1 = +10)', () => {
  const match = scoreCapabilities(
    { agentId: 'a', capabilityIds: ['code-gen', 'review'], platform: 'claude_code' },
    { requiredCapabilities: ['code-gen'] },
  );
  // base 60 (1/1 * 60) + tier-1 10 = 70
  assert.equal(match.score, 70);
  assert.deepEqual(match.missingCapabilities, []);
  assert.deepEqual(match.matchedCapabilities, ['code-gen']);
});

test('zero matched of a non-empty required set scores 0 and is excluded', () => {
  const match = scoreCapabilities(
    { agentId: 'a', capabilityIds: ['unrelated'], platform: 'custom' },
    { requiredCapabilities: ['code-gen', 'review'] },
  );
  assert.equal(match.score, 0);
  assert.deepEqual(match.missingCapabilities, ['code-gen', 'review']);
});

test('preferred capabilities add (matched/total)*20; platform match adds 10', () => {
  const match = scoreCapabilities(
    { agentId: 'a', capabilityIds: ['code-gen', 'testing'], platform: 'claude_code' },
    {
      requiredCapabilities: ['code-gen'],
      preferredCapabilities: ['testing', 'design'],
      preferredPlatform: 'claude',
    },
  );
  // base 60 + preferred (1/2*20=10) + platform 10 + tier-1 10 = 90
  assert.equal(match.score, 90);
});

test('no required capabilities yields full base score', () => {
  const match = scoreCapabilities(
    { agentId: 'a', capabilityIds: [], platform: 'custom' },
    { requiredCapabilities: [] },
  );
  // base 60 + tier custom 0 = 60
  assert.equal(match.score, 60);
});

test('matchCapabilities sorts by score desc, tier tiebreak, then agentId', () => {
  const ranked = matchCapabilities(
    [
      { agentId: 'b', capabilityIds: ['code-gen'], platform: 'cursor' }, // 60+5=65
      { agentId: 'a', capabilityIds: ['code-gen'], platform: 'claude_code' }, // 60+10=70
      { agentId: 'c', capabilityIds: ['code-gen'], platform: 'claude_code' }, // 70, ties a → id order
    ],
    { requiredCapabilities: ['code-gen'] },
  );
  assert.deepEqual(ranked.map((m) => m.agentId), ['a', 'c', 'b']);
});

test('platformMatches treats claude and claude_code as equivalent', () => {
  assert.equal(platformMatches('claude_code', 'claude'), true);
  assert.equal(platformMatches('claude', 'claude_code'), true);
  assert.equal(platformMatches('cursor', 'claude'), false);
});

test('determineTier classifies known platforms', () => {
  assert.equal(determineTier('codex'), 'tier-1');
  assert.equal(determineTier('windsurf'), 'tier-2');
  assert.equal(determineTier('something'), 'custom');
  assert.equal(determineTier(undefined), 'custom');
});
