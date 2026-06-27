/**
 * EventBusPort — publish/subscribe CoordinationEvents. In-proc + NATS adapters
 * implement this (MERGED from the A2A event-bus). Subscriptions are scoped by
 * the event's `scope` (global/space/task/squad).
 */

import type { CoordinationEvent, EventScope } from '../domain';

export type EventHandler = (event: CoordinationEvent) => void | Promise<void>;

export type Unsubscribe = () => void;

export interface EventBusPort {
  publish(event: CoordinationEvent): Promise<void>;
  /** Subscribe to events matching a scope filter (empty filter = all). */
  subscribe(scope: EventScope, handler: EventHandler): Unsubscribe;
}
