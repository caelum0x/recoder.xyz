/**
 * MemorySquadStore — Map-backed `SquadStorePort`. Splits the A2A
 * `squad.service` JSON persistence behind the port; holds `Squad` domain values
 * for tests and single-process runtimes. The Postgres adapter (wave-2) maps the
 * multica squad tables to the same shape.
 */

import type { Squad } from '../../domain';
import type { SquadStorePort } from '../../ports';

export class MemorySquadStore implements SquadStorePort {
  private readonly squads = new Map<string, Squad>();

  /** Seed/replace a squad (test + runtime convenience). */
  upsert(squad: Squad): void {
    this.squads.set(squad.id, { ...squad, members: [...squad.members], activity: [...squad.activity] });
  }

  async get(squadId: string): Promise<Squad | undefined> {
    const squad = this.squads.get(squadId);
    return squad ? { ...squad } : undefined;
  }

  async list(ownerId?: string): Promise<Squad[]> {
    const out: Squad[] = [];
    for (const squad of this.squads.values()) {
      if (ownerId === undefined || squad.ownerId === ownerId) {
        out.push({ ...squad });
      }
    }
    return out;
  }

  async forMember(memberId: string): Promise<Squad[]> {
    const out: Squad[] = [];
    for (const squad of this.squads.values()) {
      if (squad.members.some((member) => member.id === memberId)) {
        out.push({ ...squad });
      }
    }
    return out;
  }
}
