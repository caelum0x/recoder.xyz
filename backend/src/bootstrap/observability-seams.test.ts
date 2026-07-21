/**
 * Composition-root seam tests for the bootstrap → observability wiring
 * (`observability-seams.ts`): the `runEvents` / `board` / `notifier` delivery
 * objects. The signals bridge ingests onto the agent-os RunEvent bus with
 * provenance `'engine'`; needs-you signals + fired alerts post through the SAME
 * truthful notify webhook — each a pure, verbatim mapping.
 */
import { describe, it, expect, vi } from 'vitest';
import type { RunEvent } from '@recoder/agent-os';
import type { AlertEvent, AlertRule, WorkSignal } from '../domains/observability/index.js';
import { createObservabilityDelivery } from './observability-seams.js';

describe('createObservabilityDelivery', () => {
  it('bridges a normalized signal onto the RunEvent bus with source=engine', async () => {
    const ingest = vi.fn(async () => ({ accepted: true }));
    const notify = vi.fn(async () => ({ status: 'ok' }));
    const delivery = createObservabilityDelivery({
      runEventBus: { ingest },
      notifyEngine: { notify } as never,
    });
    const event = { eventId: 'e1', taskId: 't1' } as unknown as RunEvent;

    await delivery.runEvents.ingest(event, 'ignored-by-bridge');

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledWith(event, 'engine');
  });

  it('surfaces a needs-you signal through the notify webhook (board seam)', async () => {
    const notify = vi.fn(async () => ({ status: 'ok' }));
    const delivery = createObservabilityDelivery({
      runEventBus: { ingest: async () => ({}) },
      notifyEngine: { notify } as never,
    });
    const signal = {
      title: 'stale PR',
      reason: 'no review in 3d',
      sourceUrl: 'https://x/pr/1',
      priority: 'high',
    } as unknown as WorkSignal;

    await delivery.board.notify(signal);

    expect(notify).toHaveBeenCalledWith({
      title: 'needs-you: stale PR',
      message: 'no review in 3d (https://x/pr/1)',
      level: 'warn',
    });
  });

  it('uses info level for a non-high-priority board signal', async () => {
    const notify = vi.fn(async () => ({ status: 'ok' }));
    const delivery = createObservabilityDelivery({
      runEventBus: { ingest: async () => ({}) },
      notifyEngine: { notify } as never,
    });
    await delivery.board.notify({
      title: 't',
      reason: 'r',
      sourceUrl: 'u',
      priority: 'low',
    } as unknown as WorkSignal);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ level: 'info' }));
  });

  it('delivers a fired alert through the notify webhook, mapping severity → level', async () => {
    const notify = vi.fn(async () => ({ status: 'ok' }));
    const delivery = createObservabilityDelivery({
      runEventBus: { ingest: async () => ({}) },
      notifyEngine: { notify } as never,
    });
    const rule = { name: 'health-down', severity: 'critical' } as unknown as AlertRule;
    const event = { status: 'firing', value: 3, firedAt: '2026-01-01T00:00:00Z' } as unknown as AlertEvent;

    await delivery.notifier.deliver(rule, event);

    expect(notify).toHaveBeenCalledWith({
      title: 'alert critical: health-down',
      message: 'status=firing value=3 fired_at=2026-01-01T00:00:00Z',
      level: 'error',
    });
  });

  it('maps warning severity → warn and other severities → info', async () => {
    const notify = vi.fn(async () => ({ status: 'ok' }));
    const delivery = createObservabilityDelivery({
      runEventBus: { ingest: async () => ({}) },
      notifyEngine: { notify } as never,
    });
    const event = { status: 'firing', firedAt: 't' } as unknown as AlertEvent;

    await delivery.notifier.deliver({ name: 'w', severity: 'warning' } as unknown as AlertRule, event);
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'warn' }));
    // `value` absent ⇒ the message carries the truthful 'n/a' placeholder.
    expect(notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'status=firing value=n/a fired_at=t' }),
    );

    await delivery.notifier.deliver({ name: 'i', severity: 'info' } as unknown as AlertRule, event);
    expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'info' }));
  });
});
