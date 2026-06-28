import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadGovernanceConfig, defaultGovernanceConfig } from '../src/governance-config';
import { GovernanceConfigError } from '../src/errors';

describe('governance-config', () => {
  it('defaults are conservative (auto-approve off, audit on)', () => {
    const c = defaultGovernanceConfig();
    assert.equal(c.autoApprove.enabled, false);
    assert.equal(c.autoApprove.ceiling, 'medium');
    assert.equal(c.auditEnabled, true);
    assert.equal(c.ffiFallbackEnabled, false);
  });

  it('accepts a valid override', () => {
    const c = loadGovernanceConfig({ autoApprove: { enabled: true, ceiling: 'high' } });
    assert.equal(c.autoApprove.enabled, true);
    assert.equal(c.autoApprove.ceiling, 'high');
  });

  it('rejects an invalid risk tier (fail closed)', () => {
    assert.throws(
      // @ts-expect-error invalid tier on purpose
      () => loadGovernanceConfig({ autoApprove: { enabled: true, ceiling: 'ultra' } }),
      GovernanceConfigError,
    );
  });

  it('rejects an invalid OPA endpoint url', () => {
    assert.throws(() => loadGovernanceConfig({ opaEndpoint: 'not-a-url' }), GovernanceConfigError);
  });

  it('merges forbidden path globs as an array', () => {
    const c = loadGovernanceConfig({ forbiddenPathGlobs: ['**/infra/**'] });
    assert.deepEqual(c.forbiddenPathGlobs, ['**/infra/**']);
  });
});
