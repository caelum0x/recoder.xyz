/**
 * conductor → inference seam — proves the CLI inference-metering fusion FIRES
 * end-to-end and degrades truthfully.
 *
 * The seam turns the `tmux_worktree` CLI substrate into a metered gateway caller:
 * when a tier is bound + a credential mints, every launched CLI is pointed at THIS
 * backend's OpenAI-compatible gateway edge (usage ledger + entitlement quota +
 * delivery audit). It NEVER blocks a launch and NEVER fakes metering: a down
 * gateway / unmintable key / a throwing probe all resolve to an empty env so the
 * CLI runs on its own BYOK keys, honestly unmetered.
 *
 * The final test wires the REAL `createCliRuntimeSubstrate` over a fake inner
 * substrate, proving the substrate RECEIVES the hook and a launch routes through
 * the gateway path (the resolved gateway env reaches the inner launch, merged UNDER
 * the caller's env so an explicit override still wins).
 */
import { describe, it, expect, vi } from 'vitest';
import type { InferenceHealth } from '../domains/inference/types.js';
import {
  createCliRuntimeSubstrate,
  type CliInferenceContext,
} from '../domains/conductor/adapters/cli-runtime.adapter.js';
import type {
  ConductorSubstrate,
  SubstrateLaunchInput,
  SubstrateHandle,
} from '../domains/conductor/ports/substrate-registry.port.js';
import { createCliInferenceEnvResolver } from './conductor-inference-seam.js';

const BASE_URL = 'http://127.0.0.1:3001/api/gateway/gateway/v1';

function health(overrides: Partial<InferenceHealth> = {}): InferenceHealth {
  return {
    tier: 'napi',
    available: true,
    napiBound: true,
    loopbackConfigured: false,
    ...overrides,
  };
}

const CTX: CliInferenceContext = {
  workspaceId: 'ws-1',
  repoPath: '/repo',
  branch: 'feat/x',
  env: {},
};

describe('createCliInferenceEnvResolver', () => {
  it('FIRES: a bound gateway + minted key ⇒ OpenAI-compatible gateway env', async () => {
    const resolver = createCliInferenceEnvResolver({
      gateway: { health: async () => health() },
      baseUrl: BASE_URL,
      mintGatewayKey: async () => 'sk_conductor_live',
    });

    const env = await resolver(CTX);

    expect(env).toEqual({
      OPENAI_BASE_URL: BASE_URL,
      OPENAI_API_KEY: 'sk_conductor_live',
      RECODER_INFERENCE_GATEWAY: BASE_URL,
    });
    // NEVER points an Anthropic-wire client at the OpenAI-wire surface.
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  it('degrades truthfully: no bound tier ⇒ {} and the key is never minted', async () => {
    const mintGatewayKey = vi.fn(async () => 'sk_should_not_be_used');
    const resolver = createCliInferenceEnvResolver({
      gateway: { health: async () => health({ available: false, tier: 'none' }) },
      baseUrl: BASE_URL,
      mintGatewayKey,
    });

    expect(await resolver(CTX)).toEqual({});
    expect(mintGatewayKey).not.toHaveBeenCalled();
  });

  it('degrades truthfully: gateway up but key unmintable (no DB) ⇒ {}', async () => {
    const resolver = createCliInferenceEnvResolver({
      gateway: { health: async () => health() },
      baseUrl: BASE_URL,
      mintGatewayKey: async () => null,
    });

    expect(await resolver(CTX)).toEqual({});
  });

  it('never throws across the seam: a throwing health probe ⇒ {}', async () => {
    const resolver = createCliInferenceEnvResolver({
      gateway: {
        health: async () => {
          throw new Error('gateway exploded');
        },
      },
      baseUrl: BASE_URL,
      mintGatewayKey: async () => 'sk_live',
    });

    await expect(resolver(CTX)).resolves.toEqual({});
  });

  it('never throws across the seam: a throwing mint ⇒ {} (unmetered, logged)', async () => {
    const warn = vi.fn();
    const resolver = createCliInferenceEnvResolver({
      gateway: { health: async () => health() },
      baseUrl: BASE_URL,
      mintGatewayKey: async () => {
        throw new Error('key store down');
      },
      logger: { info() {}, warn },
    });

    await expect(resolver(CTX)).resolves.toEqual({});
    expect(warn).toHaveBeenCalledOnce();
  });

  it('memoizes the credential: two launches mint ONCE', async () => {
    const mintGatewayKey = vi.fn(async () => 'sk_once');
    const resolver = createCliInferenceEnvResolver({
      gateway: { health: async () => health() },
      baseUrl: BASE_URL,
      mintGatewayKey,
    });

    const a = await resolver(CTX);
    const b = await resolver({ ...CTX, workspaceId: 'ws-2' });

    expect(a.OPENAI_API_KEY).toBe('sk_once');
    expect(b.OPENAI_API_KEY).toBe('sk_once');
    expect(mintGatewayKey).toHaveBeenCalledOnce();
  });

  it('retries the mint on a later launch after a transient null', async () => {
    let attempt = 0;
    const mintGatewayKey = vi.fn(async () => (++attempt === 1 ? null : 'sk_recovered'));
    const resolver = createCliInferenceEnvResolver({
      gateway: { health: async () => health() },
      baseUrl: BASE_URL,
      mintGatewayKey,
    });

    expect(await resolver(CTX)).toEqual({}); // key store was down
    const recovered = await resolver(CTX); // store recovered
    expect(recovered.OPENAI_API_KEY).toBe('sk_recovered');
    expect(mintGatewayKey).toHaveBeenCalledTimes(2);
  });
});

describe('createCliRuntimeSubstrate + inference seam (end-to-end fusion)', () => {
  /** A fake inner substrate that records the env it was launched with. */
  function fakeInner(): { substrate: ConductorSubstrate; lastEnv: () => Record<string, string> | undefined } {
    let launched: SubstrateLaunchInput | undefined;
    const substrate: ConductorSubstrate = {
      id: 'tmux_worktree',
      capabilities: () => ({
        remote: false,
        supportsPty: true,
        supportsInteractiveKeys: true,
        capturesByPolling: true,
        supportsDiff: true,
        supportsIsolationRemoval: true,
      }),
      available: async () => ({ available: true }),
      async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
        launched = input;
        return { ref: input.workspaceId, worktreePath: '/wt', sessionName: input.workspaceId };
      },
      capture: async () => null,
      alive: async () => true,
      diff: async () => ({ stat: '', patch: '', untracked: [], changedFiles: 0 }),
      teardown: async () => {},
    };
    return { substrate, lastEnv: () => launched?.env };
  }

  const launchInput = (env?: Record<string, string>): SubstrateLaunchInput => ({
    workspaceId: 'ws-e2e',
    command: 'claude',
    repoPath: '/repo',
    branch: 'feat/e2e',
    baseRef: 'HEAD',
    ...(env ? { env } : {}),
  });

  it('the substrate RECEIVES the hook and a launch routes through the gateway path', async () => {
    const inner = fakeInner();
    const resolver = createCliInferenceEnvResolver({
      gateway: { health: async () => health() },
      baseUrl: BASE_URL,
      mintGatewayKey: async () => 'sk_e2e',
    });
    const cli = createCliRuntimeSubstrate({
      config: { tmuxBin: 'tmux', worktreeRoot: '/tmp/wt' },
      inner: inner.substrate,
      resolveInferenceEnv: resolver,
    });

    await cli.launch(launchInput({ EXISTING: 'keep' }));

    const env = inner.lastEnv();
    // The gateway routing env reached the inner launch (fusion FIRED)...
    expect(env?.OPENAI_BASE_URL).toBe(BASE_URL);
    expect(env?.OPENAI_API_KEY).toBe('sk_e2e');
    // ...merged UNDER the caller's env (the pre-existing var survives).
    expect(env?.EXISTING).toBe('keep');
  });

  it('the caller env WINS on collision (composer path e composes over the base)', async () => {
    const inner = fakeInner();
    const resolver = createCliInferenceEnvResolver({
      gateway: { health: async () => health() },
      baseUrl: BASE_URL,
      mintGatewayKey: async () => 'sk_base',
    });
    const cli = createCliRuntimeSubstrate({
      config: { tmuxBin: 'tmux', worktreeRoot: '/tmp/wt' },
      inner: inner.substrate,
      resolveInferenceEnv: resolver,
    });

    await cli.launch(launchInput({ OPENAI_API_KEY: 'sk_caller_override' }));

    expect(inner.lastEnv()?.OPENAI_API_KEY).toBe('sk_caller_override');
  });

  it('degrade-truthful: gateway down ⇒ the CLI launches with the caller env UNCHANGED', async () => {
    const inner = fakeInner();
    const resolver = createCliInferenceEnvResolver({
      gateway: { health: async () => health({ available: false, tier: 'none' }) },
      baseUrl: BASE_URL,
      mintGatewayKey: async () => 'sk_never',
    });
    const cli = createCliRuntimeSubstrate({
      config: { tmuxBin: 'tmux', worktreeRoot: '/tmp/wt' },
      inner: inner.substrate,
      resolveInferenceEnv: resolver,
    });

    await cli.launch(launchInput({ ONLY: 'mine' }));

    // No gateway env injected — the CLI runs on its own BYOK keys, unmetered.
    expect(inner.lastEnv()).toEqual({ ONLY: 'mine' });
    expect(inner.lastEnv()?.OPENAI_BASE_URL).toBeUndefined();
  });
});
