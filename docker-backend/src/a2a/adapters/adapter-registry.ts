/**
 * @module adapter-registry
 *
 * Unified Adapter Registry for the A2A protocol adapter layer.
 *
 * Wraps the per-type REST and Git adapter registries into a single facade,
 * providing type-agnostic listing/lookup across all adapters, aggregate
 * health status, and lifecycle event emission.
 *
 * P17-011: Unified Adapter Registry
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../logger';

import {
  RestAdapter,
  registerRestAdapter,
  getRestAdapter,
  listRestAdapters,
  unregisterRestAdapter,
  resetRestAdapters,
} from './rest-adapter';

import {
  GitAdapter,
  registerGitAdapter,
  getGitAdapter,
  listGitAdapters,
  unregisterGitAdapter,
  resetGitAdapters,
} from './git-adapter';

const logger = createLogger('a2a-adapter-registry');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The two supported adapter protocol types. */
export type AdapterType = 'rest' | 'git';

/** An entry in the unified registry representing a single adapter. */
export interface AdapterEntry {
  type: AdapterType;
  adapterId: string;
  status: string;
  registeredAt: string;
}

/** Aggregate health summary across all registered adapters. */
export interface AdapterHealthSummary {
  total: number;
  byType: Record<AdapterType, number>;
  byStatus: Record<string, number>;
  adapters: AdapterEntry[];
}

/** Events emitted by the AdapterRegistry. */
export interface AdapterRegistryEvents {
  'adapter:registered': { type: AdapterType; adapterId: string; timestamp: string };
  'adapter:unregistered': { type: AdapterType; adapterId: string; timestamp: string };
  'adapter:health-changed': { type: AdapterType; adapterId: string; oldStatus: string; newStatus: string; timestamp: string };
}

// ---------------------------------------------------------------------------
// AdapterRegistry
// ---------------------------------------------------------------------------

/**
 * Unified registry that wraps both REST and Git per-type registries
 * into a single facade with lifecycle hooks and event emission.
 */
export class AdapterRegistry extends EventEmitter {
  /** Internal tracking map: adapterId -> AdapterEntry metadata. */
  private readonly entries = new Map<string, AdapterEntry>();

  // -----------------------------------------------------------------------
  // Register
  // -----------------------------------------------------------------------

  /**
   * Register an adapter with both the per-type registry and the unified
   * tracking map. Emits 'adapter:registered'.
   */
  registerAdapter(type: AdapterType, adapter: RestAdapter | GitAdapter): void {
    const adapterId = adapter.adapterId;

    if (type === 'rest') {
      registerRestAdapter(adapter as RestAdapter);
    } else {
      registerGitAdapter(adapter as GitAdapter);
    }

    const entry: AdapterEntry = {
      type,
      adapterId,
      status: adapter.status,
      registeredAt: new Date().toISOString(),
    };

    this.entries.set(adapterId, entry);

    const event = {
      type,
      adapterId,
      timestamp: entry.registeredAt,
    };

    this.emit('adapter:registered', event);
    logger.info(event, 'adapter registered in unified registry');
  }

  // -----------------------------------------------------------------------
  // Unregister
  // -----------------------------------------------------------------------

  /**
   * Unregister an adapter from both the per-type registry and the unified
   * tracking map. Emits 'adapter:unregistered'.
   */
  unregisterAdapter(type: AdapterType, adapterId: string): boolean {
    let removed: boolean;

    if (type === 'rest') {
      removed = unregisterRestAdapter(adapterId);
    } else {
      removed = unregisterGitAdapter(adapterId);
    }

    this.entries.delete(adapterId);

    if (removed) {
      const event = {
        type,
        adapterId,
        timestamp: new Date().toISOString(),
      };
      this.emit('adapter:unregistered', event);
      logger.info(event, 'adapter unregistered from unified registry');
    }

    return removed;
  }

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  /**
   * Get a specific adapter by type and ID.
   */
  getAdapter(type: AdapterType, adapterId: string): RestAdapter | GitAdapter | undefined {
    if (type === 'rest') {
      return getRestAdapter(adapterId);
    }
    return getGitAdapter(adapterId);
  }

  // -----------------------------------------------------------------------
  // List
  // -----------------------------------------------------------------------

  /**
   * List adapters. If `type` is specified, returns only that type from the
   * per-type registry. If no type, merges both REST and Git registries.
   */
  listAdapters(type?: AdapterType): AdapterEntry[] {
    if (type === 'rest') {
      return listRestAdapters().map((a) => this.toEntry('rest', a));
    }
    if (type === 'git') {
      return listGitAdapters().map((a) => this.toEntry('git', a));
    }

    // Merge both
    const restEntries = listRestAdapters().map((a) => this.toEntry('rest', a));
    const gitEntries = listGitAdapters().map((a) => this.toEntry('git', a));
    return [...restEntries, ...gitEntries];
  }

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------

  /**
   * Iterate all registered adapters, call getStatus() / status on each,
   * and return aggregate counts.
   */
  getHealthSummary(): AdapterHealthSummary {
    const adapters: AdapterEntry[] = [];
    const byType: Record<AdapterType, number> = { rest: 0, git: 0 };
    const byStatus: Record<string, number> = {};

    // REST adapters
    for (const adapter of listRestAdapters()) {
      const entry = this.toEntry('rest', adapter);
      adapters.push(entry);
      byType.rest++;
      byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
    }

    // Git adapters
    for (const adapter of listGitAdapters()) {
      const entry = this.toEntry('git', adapter);
      adapters.push(entry);
      byType.git++;
      byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
    }

    return {
      total: adapters.length,
      byType,
      byStatus,
      adapters,
    };
  }

  // -----------------------------------------------------------------------
  // Reset (for testing)
  // -----------------------------------------------------------------------

  /**
   * Reset the unified registry and both per-type registries.
   */
  reset(): void {
    this.entries.clear();
    resetRestAdapters();
    resetGitAdapters();
    this.removeAllListeners();
    logger.info('adapter registry reset');
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private toEntry(type: AdapterType, adapter: RestAdapter | GitAdapter): AdapterEntry {
    const tracked = this.entries.get(adapter.adapterId);
    return {
      type,
      adapterId: adapter.adapterId,
      status: adapter.status,
      registeredAt: tracked?.registeredAt ?? new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: AdapterRegistry | null = null;

/** Get the singleton AdapterRegistry instance. */
export function getAdapterRegistry(): AdapterRegistry {
  if (!instance) {
    instance = new AdapterRegistry();
  }
  return instance;
}

/** Reset the singleton (for testing). */
export function resetAdapterRegistry(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}
