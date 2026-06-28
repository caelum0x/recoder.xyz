/**
 * uuidId — the real IdPort backed by node:crypto randomUUID.
 *
 * Not a stub: it generates real RFC-4122 v4 ids. Tests that need deterministic
 * ids inject their own IdPort instead.
 */
import { randomUUID } from 'node:crypto';
import type { IdPort } from '../ports/id.port.js';

export const uuidId: IdPort = {
  newId: () => randomUUID(),
};
