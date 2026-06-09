/**
 * @module collab-events.service
 *
 * Event-driven collaboration lifecycle (inspired by pi's EventStream): a typed
 * in-process event bus that squad/dispatch/presence changes emit to, plus a
 * bounded ring buffer of recent events. Consumers (the SSE stream, dashboards,
 * other agents) subscribe without coupling to the services that emit. Pure
 * in-memory and fail-safe — emitting never throws into the caller.
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '../logger';

const logger = createLogger('collab-events.service');

export type CollabEventType =
  | 'squad.created'
  | 'squad.updated'
  | 'squad.deleted'
  | 'squad.member_added'
  | 'squad.member_removed'
  | 'squad.role_changed'
  | 'squad.activity'
  | 'task.dispatched'
  | 'task.assignment'
  | 'presence.changed';

export interface CollabEvent {
  at: string;
  type: CollabEventType;
  squadId?: string;
  squadName?: string;
  actor?: string;
  action?: string;
  detail?: string;
  data?: Record<string, unknown>;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0); // many SSE subscribers

const ring: CollabEvent[] = [];
const MAX_RING = 200;

export function emitCollabEvent(event: Omit<CollabEvent, 'at'>): void {
  try {
    const full: CollabEvent = { at: new Date().toISOString(), ...event };
    ring.push(full);
    if (ring.length > MAX_RING) ring.shift();
    emitter.emit('event', full);
  } catch (err) {
    logger.warn({ err }, 'emitCollabEvent failed (non-fatal)');
  }
}

export function subscribeCollab(handler: (event: CollabEvent) => void): () => void {
  emitter.on('event', handler);
  return () => emitter.off('event', handler);
}

export function recentCollabEvents(limit = 50): CollabEvent[] {
  const n = Math.min(Math.max(limit, 1), MAX_RING);
  return ring.slice(-n).reverse();
}
