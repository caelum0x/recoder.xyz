import { describe, expect, it } from 'vitest';
import { __testSelectTargets } from './a2a-gateway';

describe('a2a orchestrator target selection', () => {
  const codex = {
    agent_id: 'codex',
    platform: 'codex',
    base_url: 'http://codex.local',
    enabled: true,
    auth_mode: 'hmac_shared_secret',
    health: 'healthy',
    updated_at: new Date().toISOString(),
  } as const;

  const claude = {
    agent_id: 'claude_code',
    platform: 'claude_code',
    base_url: 'http://claude.local',
    enabled: true,
    auth_mode: 'hmac_shared_secret',
    health: 'healthy',
    updated_at: new Date().toISOString(),
  } as const;

  it('selects both agents for parallel mode', () => {
    const selected = __testSelectTargets({ mode: 'parallel', codex, claude });
    expect(selected).toEqual(['codex', 'claude_code']);
  });

  it('selects only codex for codex_only mode', () => {
    const selected = __testSelectTargets({ mode: 'codex_only', codex, claude });
    expect(selected).toEqual(['codex']);
  });

  it('selects only claude for claude_only mode', () => {
    const selected = __testSelectTargets({ mode: 'claude_only', codex, claude });
    expect(selected).toEqual(['claude_code']);
  });

  it('orders targets for handoff mode by primary agent', () => {
    const selected = __testSelectTargets({
      mode: 'handoff',
      codex,
      claude,
      primaryAgent: 'claude_code',
    });
    expect(selected).toEqual(['claude_code', 'codex']);
  });

  it('orders targets for fallback mode', () => {
    const selected = __testSelectTargets({
      mode: 'fallback',
      codex,
      claude,
      primaryAgent: 'codex',
      fallbackAgent: 'claude_code',
    });
    expect(selected).toEqual(['codex', 'claude_code']);
  });
});
