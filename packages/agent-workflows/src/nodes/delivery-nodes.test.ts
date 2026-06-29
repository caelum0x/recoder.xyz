import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deployNode,
  approvalNode,
  approvalWaitNode,
  pullRequestNode,
  openPrNode,
} from './index';

test('deployNode produces a deploy node with approval-gated default', () => {
  const node = deployNode('deploy-prod', { environment: 'production', target: 'vercel' });
  assert.equal(node.kind, 'deploy');
  assert.equal(node.nodeId, 'deploy-prod');
  assert.equal(node.label, 'Deploy');
  assert.equal(node.config.environment, 'production');
  assert.equal(node.config.target, 'vercel');
  // Production-shaped deploys must default to requireApproval = true (fail safe).
  assert.equal(node.config.requireApproval, true);
});

test('deployNode allows opting out of approval and works with no config', () => {
  const optOut = deployNode('deploy-preview', { environment: 'preview', requireApproval: false });
  assert.equal(optOut.config.requireApproval, false);

  const bare = deployNode('deploy-bare');
  assert.equal(bare.kind, 'deploy');
  assert.equal(bare.config.requireApproval, true);
});

test('approvalWaitNode is a distinct approval-wait kind with a sensible default gate', () => {
  const node = approvalWaitNode('gate', { reason: 'human sign-off before release' });
  assert.equal(node.kind, 'approval-wait');
  assert.equal(node.label, 'Approval Wait');
  assert.equal(node.config.reason, 'human sign-off before release');
  assert.equal(node.config.requiredAt, 'after_verification');
});

test('approvalNode remains the legacy approval kind (export stability)', () => {
  const node = approvalNode('legacy', { reason: 'x' });
  assert.equal(node.kind, 'approval');
});

test('openPrNode is an alias for pullRequestNode producing a pull-request node', () => {
  assert.equal(openPrNode, pullRequestNode);
  const node = openPrNode('open', { repo: 'r/x', branch: 'feat', title: 'Add feature' });
  assert.equal(node.kind, 'pull-request');
  assert.equal(node.config.repo, 'r/x');
  // Defaults preserved through the alias.
  assert.equal(node.config.approvalRequired, true);
  assert.equal(node.config.artifactRequired, true);
});
