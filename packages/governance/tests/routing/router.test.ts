import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoutingService } from '../../src/routing/router';
import { estimateComplexity } from '../../src/routing/complexity-estimator';
import { createGovernanceRequest } from '../../src/domain/governance-request';
import { makeAgent, makeTask } from '../fixtures';

describe('complexity-estimator', () => {
  it('returns a bounded score in [0,1]', () => {
    const req = createGovernanceRequest({
      actor: makeAgent(),
      task: makeTask(),
      action: 'command.run',
      target: { command: 'git commit' },
      context: { promptTokens: 100000, toolCount: 100, conversationDepth: 100 },
    });
    const c = estimateComplexity(req);
    assert.ok(c.total <= 1 && c.total >= 0);
    assert.ok(c.total > 0.5); // saturated signals -> high
  });

  it('code markers raise the code score', () => {
    const req = createGovernanceRequest({
      actor: makeAgent(),
      task: makeTask(),
      action: 'command.run',
      target: { command: 'function foo() => import bar' },
    });
    assert.ok(estimateComplexity(req).codeScore > 0);
  });

  it('a trivial read scores near zero', () => {
    const req = createGovernanceRequest({ actor: makeAgent(), task: makeTask(), action: 'file.read', target: { path: 'a' } });
    assert.ok(estimateComplexity(req).total < 0.2);
  });
});

describe('RoutingService', () => {
  const routing = new RoutingService();

  it('denied actions never route', () => {
    const req = createGovernanceRequest({ actor: makeAgent(), task: makeTask(), action: 'file.write', target: { path: 'x' } });
    const d = routing.route(req, 'deny');
    assert.equal(d.routable, false);
    assert.equal(d.model, undefined);
    assert.equal(d.runtime, undefined);
  });

  it('allowed low-tier read routes to a cheap model', () => {
    const req = createGovernanceRequest({ actor: makeAgent(), task: makeTask(), action: 'file.read', target: { path: 'x' } });
    const d = routing.route(req, 'allow');
    assert.equal(d.routable, true);
    assert.equal(d.tier, 'low');
    assert.ok(d.costHint < 0.3);
  });

  it('needs_approval high-tier action routes high', () => {
    const req = createGovernanceRequest({ actor: makeAgent(), task: makeTask(), action: 'branch.push', target: {} });
    const d = routing.route(req, 'needs_approval');
    assert.equal(d.routable, true);
    assert.ok(d.tier === 'high' || d.tier === 'critical');
    assert.ok((d.costHint ?? 0) >= 0.8);
  });
});
