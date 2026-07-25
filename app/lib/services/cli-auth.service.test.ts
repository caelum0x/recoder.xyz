// @vitest-environment node
/**
 * CLI Auth Service identity tests (T0.3b)
 * The device-code, refresh, and verify surfaces must carry the display
 * identity (name + avatarUrl from users.image) so desktop/CLI clients can
 * render the signed-in user without a separate profile fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../prisma', () => ({
  prisma: {
    deviceCode: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    cli_sessions: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    api_keys: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { CLIAuthService } from './cli-auth.service';
import { prisma } from '../prisma';

const mockPrisma = vi.mocked(prisma, true);

const futureDate = () => new Date(Date.now() + 60 * 60 * 1000);

const baseUser = {
  id: 'user_1',
  email: 'arhan@recoder.xyz',
  name: 'Arhan Subasi',
  subscriptionPlan: 'pro',
  image: 'https://recoder.xyz/avatar.png',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pollDeviceCode identity payload', () => {
  it('returns user name + avatarUrl (from users.image) once authorized', async () => {
    mockPrisma.deviceCode.findUnique.mockResolvedValue({
      id: 'dc_1',
      status: 'authorized',
      expiresAt: futureDate(),
      user: { ...baseUser },
    } as never);
    mockPrisma.cli_sessions.create.mockResolvedValue({} as never);
    mockPrisma.deviceCode.update.mockResolvedValue({} as never);

    const result = await CLIAuthService.pollDeviceCode('device_code_1');

    expect(result.status).toBe('authorized');
    if (!('user' in result)) throw new Error('Expected authorized result with user');
    expect(result.user).toMatchObject({
      email: 'arhan@recoder.xyz',
      name: 'Arhan Subasi',
      plan: 'pro',
      avatarUrl: 'https://recoder.xyz/avatar.png',
    });
  });

  it('omits avatarUrl when the user has no image — never fabricates', async () => {
    mockPrisma.deviceCode.findUnique.mockResolvedValue({
      id: 'dc_1',
      status: 'authorized',
      expiresAt: futureDate(),
      user: { ...baseUser, image: null },
    } as never);
    mockPrisma.cli_sessions.create.mockResolvedValue({} as never);
    mockPrisma.deviceCode.update.mockResolvedValue({} as never);

    const result = await CLIAuthService.pollDeviceCode('device_code_1');

    if (!('user' in result)) throw new Error('Expected authorized result with user');
    expect(result.user).toMatchObject({ name: 'Arhan Subasi' });
    expect(result.user).not.toHaveProperty('avatarUrl');
  });
});

describe('refreshAccessToken identity payload', () => {
  it('carries user name + avatarUrl so refresh clients do not drop identity', async () => {
    mockPrisma.cli_sessions.findUnique.mockResolvedValue({
      id: 'cli_1',
      isActive: true,
      users: { ...baseUser },
    } as never);
    mockPrisma.cli_sessions.update.mockResolvedValue({} as never);

    const result = await CLIAuthService.refreshAccessToken('recr_token');

    expect(typeof result.access_token).toBe('string');
    expect(result.user).toMatchObject({
      email: 'arhan@recoder.xyz',
      name: 'Arhan Subasi',
      plan: 'pro',
      avatarUrl: 'https://recoder.xyz/avatar.png',
    });
  });
});

describe('validateAccessToken identity payload', () => {
  it('includes name + avatarUrl on the verify surface', async () => {
    mockPrisma.cli_sessions.findUnique.mockResolvedValue({
      id: 'cli_1',
      isActive: true,
      expiresAt: futureDate(),
      users: { ...baseUser, subscriptionStatus: 'active', emailVerified: true },
    } as never);
    mockPrisma.cli_sessions.update.mockResolvedValue({} as never);

    const result = await CLIAuthService.validateAccessToken('reco_token');

    expect(result).toMatchObject({
      name: 'Arhan Subasi',
      avatarUrl: 'https://recoder.xyz/avatar.png',
    });
  });
});
