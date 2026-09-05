// @vitest-environment node
/**
 * Onboarding Email Service Unit Tests
 * Focus: dormant-user win-back scheduling + winback processing branch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted singletons so the same mock fns survive vi.resetModules() (the
// service caches table availability at module level, so each test needs a
// fresh module instance but stable mocks).
const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    users: {
      findMany: vi.fn(),
    },
    scheduled_emails: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  sendWelcomeEmail: vi.fn(async () => ({ success: true })),
  sendGettingStartedEmail: vi.fn(async () => ({ success: true })),
  sendFeatureDeepDiveEmail: vi.fn(async () => ({ success: true })),
  sendEngagementEmail: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

async function freshService() {
  vi.resetModules();
  return import('../onboarding-email.service');
}

function tableExists(exists: boolean) {
  mocks.prisma.$queryRaw.mockResolvedValue([{ exists }]);
}

describe('scheduleWinbackEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue({ success: true, messageId: 'mock-id' });
  });

  it('schedules a winback record for each dormant user at 9:00 UTC', async () => {
    tableExists(true);
    mocks.prisma.users.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@example.com', name: 'Ada' },
      { id: 'u2', email: 'b@example.com', name: '' },
    ]);
    mocks.prisma.scheduled_emails.createMany.mockResolvedValue({ count: 2 });

    const service = await freshService();
    const result = await service.scheduleWinbackEmails();

    expect(result.scheduled).toBe(2);
    expect(mocks.prisma.scheduled_emails.createMany).toHaveBeenCalledTimes(1);
    const { data } = mocks.prisma.scheduled_emails.createMany.mock.calls[0][0] as {
      data: Array<{ type: string; status: string; scheduledAt: Date; userId: string }>;
    };
    expect(data).toHaveLength(2);
    for (const record of data) {
      expect(record.type).toBe('winback');
      expect(record.status).toBe('pending');
      expect(record.scheduledAt.getUTCHours()).toBe(9);
      expect(record.scheduledAt.getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
    }
  });

  it('dedupes: query excludes users who already have any winback record', async () => {
    tableExists(true);
    mocks.prisma.users.findMany.mockResolvedValue([]);

    const service = await freshService();
    const result = await service.scheduleWinbackEmails();

    expect(result.scheduled).toBe(0);
    expect(mocks.prisma.scheduled_emails.createMany).not.toHaveBeenCalled();
    const where = mocks.prisma.users.findMany.mock.calls[0][0]?.where as Record<string, unknown>;
    expect(where.scheduled_emails).toEqual({ none: { type: 'winback' } });
    expect(where.isActive).toBe(true);
    expect(where.emailVerified).toBe(true);
    // Dormancy = stale lastLoginAt OR never-logged-in old signup
    expect(Array.isArray(where.OR)).toBe(true);
  });

  it('returns 0 and never throws when the scheduled_emails table is missing', async () => {
    tableExists(false);

    const service = await freshService();
    await expect(service.scheduleWinbackEmails()).resolves.toEqual({ scheduled: 0 });
    expect(mocks.prisma.users.findMany).not.toHaveBeenCalled();
  });

  it('swallows database errors instead of throwing (cron safety)', async () => {
    tableExists(true);
    mocks.prisma.users.findMany.mockRejectedValue(new Error('db down'));

    const service = await freshService();
    await expect(service.scheduleWinbackEmails()).resolves.toEqual({ scheduled: 0 });
  });
});

describe('processScheduledEmails winback branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue({ success: true, messageId: 'mock-id' });
  });

  it('sends due winback emails via sendEmail and marks them sent', async () => {
    tableExists(true);
    mocks.prisma.scheduled_emails.findMany.mockResolvedValue([
      {
        id: 'se1',
        userId: 'u1',
        email: 'a@example.com',
        name: 'Ada',
        type: 'winback',
        attempts: 0,
      },
    ]);
    mocks.prisma.scheduled_emails.update.mockResolvedValue({});

    const service = await freshService();
    const summary = await service.processScheduledEmails();

    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(0);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const sent = mocks.sendEmail.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(sent.to).toBe('a@example.com');
    expect(sent.subject.length).toBeGreaterThan(0);
    expect(sent.html).toContain('/download');
    expect(sent.html.toLowerCase()).toContain('unsubscribe');
    expect(mocks.prisma.scheduled_emails.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'se1' },
        data: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });
});
