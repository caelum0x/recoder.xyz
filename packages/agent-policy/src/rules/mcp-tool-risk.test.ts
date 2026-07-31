import { describe, expect, it } from 'vitest';
import { evaluateMcpToolRisk } from './mcp-tool-risk.js';
import type { PolicyInput } from '../engine.js';

function makeToolInput(toolName: string): PolicyInput {
  return {
    actor: {
      agentId: 'agent_test',
      permissions: { pathRules: [], allowSecretsAccess: false },
    },
    action: 'tool.call',
    target: { toolName },
    now: '2026-07-31T00:00:00.000Z',
  } as unknown as PolicyInput;
}

describe('evaluateMcpToolRisk', () => {
  it('classifies workflow.verify as high-risk (needs_approval)', () => {
    expect(evaluateMcpToolRisk(makeToolInput('workflow.verify'))?.effect).toBe('needs_approval');
  });

  it('classifies workflow.exec as high-risk', () => {
    expect(evaluateMcpToolRisk(makeToolInput('workflow.exec'))?.effect).toBe('needs_approval');
  });

  it('classifies underscore-form recoder_workflow_verify as high-risk', () => {
    expect(evaluateMcpToolRisk(makeToolInput('recoder_workflow_verify'))?.effect).toBe('needs_approval');
  });

  it('still classifies existing high-risk verbs', () => {
    expect(evaluateMcpToolRisk(makeToolInput('secret.read'))?.effect).toBe('needs_approval');
    expect(evaluateMcpToolRisk(makeToolInput('branch.push'))?.effect).toBe('needs_approval');
    expect(evaluateMcpToolRisk(makeToolInput('clink'))?.effect).toBe('needs_approval');
  });

  it('does not over-broaden to harmless workflow tools', () => {
    expect(evaluateMcpToolRisk(makeToolInput('workflow.status'))).toBeNull();
    expect(evaluateMcpToolRisk(makeToolInput('workflow.list'))).toBeNull();
  });

  it('returns null for a plainly harmless tool', () => {
    expect(evaluateMcpToolRisk(makeToolInput('memory.search'))).toBeNull();
  });
});
