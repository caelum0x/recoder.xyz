/**
 * Tests for the OSS dispatch boundary (@recoder/agent-oss) wired behind the
 * in_process conductor substrate.
 *
 * These prove the boundary is REACHABLE from product code and behaves per the
 * monorepo rule: OSS runtimes resolve to a canonical, Recoder-owned mapping that
 * never claims to own canonical state, while the default runtimes (recoder_code /
 * claude_code) bypass the boundary entirely so the proven in-process path is
 * untouched.
 */
import { describe, it, expect } from 'vitest';
import { resolveOssDispatch, resolveOssProfile } from './oss-dispatch.js';

const baseLaunch = {
  workspaceId: 'ws-test',
  repoPath: '/tmp/repo',
  branch: 'feat/x',
  prompt: 'do the thing',
};

describe('oss-dispatch boundary (@recoder/agent-oss)', () => {
  it('returns null for the default in-process runtimes (proven path untouched)', () => {
    expect(resolveOssDispatch({ ...baseLaunch, runtimeId: 'recoder_code' })).toBeNull();
    expect(resolveOssDispatch({ ...baseLaunch, runtimeId: 'claude_code' })).toBeNull();
    expect(resolveOssProfile('recoder_code')).toBeUndefined();
    expect(resolveOssProfile(undefined)).toBeUndefined();
  });

  it('resolves an OSS framework runtimeId to its agent-oss profile by adapterId', () => {
    const profile = resolveOssProfile('langgraph');
    expect(profile).toBeDefined();
    expect(profile!.adapterId).toBe('langgraph');
    expect(profile!.kind).toBe('agent_framework');
  });

  it('matches a provider alias tolerantly (browser-use ~ browser_use)', () => {
    const dashed = resolveOssProfile('browser-use');
    const unded = resolveOssProfile('browser_use');
    expect(dashed).toBeDefined();
    expect(unded).toBeDefined();
    expect(dashed!.adapterId).toBe(unded!.adapterId);
  });

  it('produces a canonical Recoder-owned mapping for an OSS runtime (never owns state)', () => {
    const result = resolveOssDispatch({ ...baseLaunch, runtimeId: 'crewai' });
    expect(result).not.toBeNull();
    expect(result!.profile.adapterId).toBe('crewai');
    // The boundary contract: the OSS surface never owns canonical Recoder state.
    expect(result!.profile.ownsCanonicalState).toBe(false);
    // The mapping carries refs back into canonical state, keyed by the workspace task.
    expect(result!.mapping.taskId).toBe('ws_ws-test');
    expect(result!.mapping.adapterId).toBe('crewai');
    expect(result!.mapping.recoderStateRefs.taskSpecId).toBe('ws_ws-test');
  });

  it('carries the rendered prompt + verification refs into the OSS mapping payload', () => {
    const result = resolveOssDispatch({ ...baseLaunch, runtimeId: 'e2b', prompt: 'ship it' });
    expect(result).not.toBeNull();
    expect(result!.mapping.externalPayload.renderedPrompt).toBe('ship it');
    expect(result!.mapping.externalPayload.goal).toBe('ship it');
  });
});
