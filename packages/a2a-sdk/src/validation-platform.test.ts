/**
 * recoder-jjal: `VALID_PLATFORMS` in validation.ts was a hand-maintained copy
 * of the platform allow-list and had DRIFTED from the canonical
 * `RecoderAgentPlatform` union — it was missing `recoder`, `cursor`,
 * `windsurf`, and `replit`, so a TaskEnvelope whose requester/assignee used any
 * of those (all valid per the type) failed runtime validation on
 * `requester.platform`. This pins the runtime allow-list to the single
 * canonical source so the two can never diverge.
 */
import { describe, expect, it } from 'vitest';

import { RECODER_AGENT_PLATFORMS } from './schemas';
import { validateTaskEnvelope } from './validation';

/** Validate an envelope whose requester carries `platform`, return its issues. */
function requesterPlatformIssues(platform: string) {
  const result = validateTaskEnvelope({
    requester: { agent_id: 'agent_1', platform },
  });
  return result.issues.filter((i) => i.path === 'requester.platform');
}

describe('platform allow-list ⇄ canonical union (recoder-jjal)', () => {
  it('accepts every canonical RecoderAgentPlatform value on requester.platform', () => {
    for (const platform of RECODER_AGENT_PLATFORMS) {
      expect(
        requesterPlatformIssues(platform),
        `platform "${platform}" should be accepted`,
      ).toEqual([]);
    }
  });

  it('still rejects a bogus platform', () => {
    expect(requesterPlatformIssues('totally_made_up').length).toBeGreaterThan(0);
  });
});
