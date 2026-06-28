/**
 * Unit tests for conductor-health-state.ts — pure substrate/health/delivery-gate
 * derivations. Real inputs only; the delivery-gate tests drive the actual
 * ApiError shape the api client throws, so the gate-narrowing is exercised
 * end-to-end without any mocks.
 */
import { describe, expect, it } from 'vitest';
import { ApiError, BackendUnreachableError, UnauthorizedError } from './api';
import type { ConductorHealth, SubstrateAvailability } from '../types';
import {
  asDeliveryGateDetail,
  availableRuntimeCount,
  availableSubstrateCount,
  deliveryGateFromError,
  deliveryGateReason,
  healthStatusTone,
  isDiskLow,
  sortSubstrates,
  substrateLabel,
  substrateTone,
  SUBSTRATE_ORDER,
} from './conductor-health-state';

const SUBSTRATES: SubstrateAvailability[] = [
  { id: 'daytona', available: false, reason: 'DAYTONA_API_KEY not set' },
  { id: 'in_process', available: true },
  { id: 'tmux_worktree', available: true },
];

function makeHealth(overrides: Partial<ConductorHealth> = {}): ConductorHealth {
  return {
    status: 'healthy',
    timestamp: '2026-06-28T00:00:00.000Z',
    substrate: { available: true, git: true, tmux: true, tmuxBin: '/usr/bin/tmux' },
    runtimes: [
      { runtimeId: 'claude', bin: 'claude', available: true, path: '/usr/local/bin/claude' },
      { runtimeId: 'codex', bin: 'codex', available: false },
    ],
    resources: {
      limits: {
        maxConcurrentWorkspaces: 8,
        maxConcurrentPerUser: 4,
        maxTmuxSessions: 16,
        minFreeDiskGb: 10,
        maxWorktreeDiskGb: 50,
      },
      current: { projectWorkspaces: 1, userWorkspaces: 1, tmuxSessions: 2, freeDiskGb: 42 },
    },
    activeTails: 1,
    dmux: { available: true, bin: '/usr/local/bin/dmux', vendored: false },
    workspaces: { total: 3, active: 2, byState: { running: 2, archived: 1 } },
    ...overrides,
  };
}

describe('substrateLabel', () => {
  it('spaces underscores in the substrate id', () => {
    expect(substrateLabel('tmux_worktree')).toBe('tmux worktree');
    expect(substrateLabel('in_process')).toBe('in process');
    expect(substrateLabel('daytona')).toBe('daytona');
  });
});

describe('substrateTone', () => {
  it('is good when available, bad when not', () => {
    expect(substrateTone({ available: true })).toBe('good');
    expect(substrateTone({ available: false })).toBe('bad');
  });
});

describe('sortSubstrates', () => {
  it('orders rows by the canonical SUBSTRATE_ORDER', () => {
    const ids = sortSubstrates(SUBSTRATES).map((s) => s.id);
    expect(ids).toEqual(['tmux_worktree', 'daytona', 'in_process']);
  });

  it('keeps unknown substrate ids after the known ones, stably', () => {
    const rows: SubstrateAvailability[] = [
      { id: 'zeta_future' as never, available: false },
      { id: 'daytona', available: false },
      { id: 'alpha_future' as never, available: true },
    ];
    const ids = sortSubstrates(rows).map((s) => s.id);
    expect(ids).toEqual(['daytona', 'alpha_future', 'zeta_future']);
  });

  it('does not mutate its input', () => {
    const input = [...SUBSTRATES];
    sortSubstrates(input);
    expect(input).toEqual(SUBSTRATES);
  });

  it('covers every canonical substrate id in SUBSTRATE_ORDER', () => {
    expect(SUBSTRATE_ORDER).toContain('tmux_worktree');
    expect(SUBSTRATE_ORDER).toContain('daytona');
    expect(SUBSTRATE_ORDER).toContain('in_process');
  });
});

describe('availableSubstrateCount', () => {
  it('counts only the available substrates', () => {
    expect(availableSubstrateCount(SUBSTRATES)).toBe(2);
    expect(availableSubstrateCount([])).toBe(0);
  });
});

describe('healthStatusTone', () => {
  it('maps each status to a tone', () => {
    expect(healthStatusTone('healthy')).toBe('good');
    expect(healthStatusTone('degraded')).toBe('warn');
    expect(healthStatusTone('unhealthy')).toBe('bad');
  });
});

describe('isDiskLow', () => {
  it('is false when free disk is above the floor', () => {
    expect(isDiskLow(makeHealth())).toBe(false);
  });

  it('is true when free disk dips below minFreeDiskGb', () => {
    const low = makeHealth();
    low.resources.current.freeDiskGb = 5;
    expect(isDiskLow(low)).toBe(true);
  });
});

describe('availableRuntimeCount', () => {
  it('counts only available runtimes', () => {
    expect(availableRuntimeCount(makeHealth())).toBe(1);
  });
});

describe('asDeliveryGateDetail', () => {
  it('narrows the real 409 gate data shape', () => {
    const detail = asDeliveryGateDetail({
      state: 'awaiting_approval',
      action: 'merge',
      approvalId: 'appr_1',
      transitioned: true,
    });
    expect(detail).toEqual({
      state: 'awaiting_approval',
      action: 'merge',
      approvalId: 'appr_1',
      transitioned: true,
    });
  });

  it('returns null when state is not awaiting_approval', () => {
    expect(asDeliveryGateDetail({ state: 'running', action: 'pr' })).toBeNull();
  });

  it('returns null for non-object / missing-action payloads', () => {
    expect(asDeliveryGateDetail(undefined)).toBeNull();
    expect(asDeliveryGateDetail(null)).toBeNull();
    expect(asDeliveryGateDetail('awaiting_approval')).toBeNull();
    expect(asDeliveryGateDetail({ state: 'awaiting_approval' })).toBeNull();
  });

  it('drops optional fields of the wrong type', () => {
    const detail = asDeliveryGateDetail({
      state: 'awaiting_approval',
      action: 'pr',
      approvalId: 42,
      transitioned: 'yes',
    });
    expect(detail).toEqual({ state: 'awaiting_approval', action: 'pr', approvalId: undefined, transitioned: undefined });
  });
});

describe('deliveryGateFromError', () => {
  it('extracts the gate verdict from a real 409 ApiError', () => {
    const err = new ApiError('no approved merge approval for task t', 409, {
      state: 'awaiting_approval',
      action: 'merge',
      approvalId: 'appr_9',
      transitioned: true,
    });
    expect(deliveryGateFromError(err)).toEqual({
      state: 'awaiting_approval',
      action: 'merge',
      approvalId: 'appr_9',
      transitioned: true,
    });
  });

  it('returns null for a non-409 ApiError', () => {
    expect(deliveryGateFromError(new ApiError('boom', 500, { state: 'awaiting_approval', action: 'pr' }))).toBeNull();
  });

  it('returns null for a 409 whose data is not a gate verdict', () => {
    expect(deliveryGateFromError(new ApiError('conflict', 409, { foo: 'bar' }))).toBeNull();
  });

  it('returns null for a backend-unreachable / unauthorized / plain error', () => {
    expect(deliveryGateFromError(new BackendUnreachableError('down'))).toBeNull();
    expect(deliveryGateFromError(new UnauthorizedError('no session', 401))).toBeNull();
    expect(deliveryGateFromError(new Error('nope'))).toBeNull();
    expect(deliveryGateFromError('nope')).toBeNull();
  });
});

describe('deliveryGateReason', () => {
  it('returns the error message for an Error', () => {
    expect(deliveryGateReason(new ApiError('needs approval', 409))).toBe('needs approval');
  });

  it('stringifies a non-Error', () => {
    expect(deliveryGateReason('raw')).toBe('raw');
  });
});
