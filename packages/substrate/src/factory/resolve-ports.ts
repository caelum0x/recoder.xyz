/**
 * resolvePorts — fill optional infrastructure ports with real host defaults.
 *
 * `clock` and `id` have correct, non-stub host implementations (system clock,
 * crypto uuid), so callers may omit them. Everything that touches canonical
 * state (logger, repository, eventSink) is still required from the caller — the
 * substrate never silently no-ops persistence or logging.
 */
import type { SubstratePorts } from './ports.js';
import { systemClock } from './system-clock.js';
import { uuidId } from './uuid-id.js';

/** SubstratePorts with the host-defaulted ports made optional for the caller. */
export type SubstratePortsInput = Omit<SubstratePorts, 'clock' | 'id'> &
  Partial<Pick<SubstratePorts, 'clock' | 'id'>>;

export function resolvePorts(input: SubstratePortsInput): SubstratePorts {
  return {
    ...input,
    clock: input.clock ?? systemClock,
    id: input.id ?? uuidId,
  };
}
