import { describe, expect, it } from 'vitest';
import { ExecutionTracker } from './execution-limits.js';
import { SubscriptionTier } from './types.js';

describe('ExecutionTracker.updateUserTier', () => {
  it('unpauses daily-limited user when upgraded and within new limits', () => {
    const tracker = new ExecutionTracker(false);
    const userId = 'user-daily';

    tracker.startSession(userId, 'project-1', 'container-1', SubscriptionTier.FREE);
    const record = (tracker as any).records.get(userId);
    record.isPaused = true;
    record.pauseReason = 'daily_limit';
    record.dailyMinutes = 60;

    tracker.updateUserTier(userId, SubscriptionTier.PRO);

    const updated = (tracker as any).records.get(userId);
    expect(updated.tier).toBe(SubscriptionTier.PRO);
    expect(updated.isPaused).toBe(false);
    expect(updated.pauseReason).toBeUndefined();
  });

  it('unpauses monthly-limited user when upgraded and within new limits', () => {
    const tracker = new ExecutionTracker(false);
    const userId = 'user-monthly';

    tracker.startSession(userId, 'project-1', 'container-1', SubscriptionTier.FREE);
    const record = (tracker as any).records.get(userId);
    record.isPaused = true;
    record.pauseReason = 'monthly_limit';
    record.monthlyHours = 2;

    tracker.updateUserTier(userId, SubscriptionTier.PRO);

    const updated = (tracker as any).records.get(userId);
    expect(updated.tier).toBe(SubscriptionTier.PRO);
    expect(updated.isPaused).toBe(false);
    expect(updated.pauseReason).toBeUndefined();
  });

  it('creates record when user has no existing record', () => {
    const tracker = new ExecutionTracker(false);
    const userId = 'new-user';

    tracker.updateUserTier(userId, SubscriptionTier.ENTERPRISE);

    const created = (tracker as any).records.get(userId);
    expect(created).toBeDefined();
    expect(created.tier).toBe(SubscriptionTier.ENTERPRISE);
    expect(created.isPaused).toBe(false);
  });
});
