/**
 * @module amb-singleton
 *
 * Singleton accessor for the AMBDispatcher instance.
 */

import { AMBDispatcher } from './amb-dispatcher';

let instance: AMBDispatcher | null = null;

export function getAMBDispatcher(): AMBDispatcher {
  if (!instance) {
    instance = new AMBDispatcher();
  }
  return instance;
}

export function resetAMBDispatcher(): void {
  instance = null;
}
