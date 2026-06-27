/**
 * SquadStorePort — reads squads/members/roles. The A2A squad.service JSON
 * persistence is split behind this port; the Postgres adapter maps multica
 * squad tables → the `Squad` domain.
 */

import type { Squad } from '../domain';

export interface SquadStorePort {
  get(squadId: string): Promise<Squad | undefined>;
  list(ownerId?: string): Promise<Squad[]>;
  /** Squads that include a given member id. */
  forMember(memberId: string): Promise<Squad[]>;
}
