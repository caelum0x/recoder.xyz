/**
 * @module patterns/pattern-registry
 *
 * Registry for collaboration patterns. Pre-registers the 3 built-in patterns.
 */

import type { CollaborationPattern, PatternType } from './types';
import { DirectHandoffPattern } from './direct-handoff';
import { SupervisorOrchestrationPattern } from './supervisor-orchestration';
import { CompetitivePattern } from './competitive-pattern';

export class PatternRegistry {
  private patterns = new Map<string, CollaborationPattern>();

  register(pattern: CollaborationPattern): void {
    this.patterns.set(pattern.patternType, pattern);
  }

  get(type: string): CollaborationPattern | undefined {
    return this.patterns.get(type);
  }

  list(): PatternType[] {
    return Array.from(this.patterns.keys()) as PatternType[];
  }

  getDetails(): Array<{ type: PatternType; description: string }> {
    const builtIns: Array<{ type: PatternType; description: string }> = [
      { type: 'direct-handoff', description: 'Agent A completes work, transfers context to Agent B for continuation' },
      { type: 'supervisor', description: 'Supervisor breaks task into subtasks, assigns to workers, aggregates results' },
      { type: 'competitive', description: 'Same task sent to multiple agents; first to complete wins' },
    ];
    return builtIns.filter((d) => this.patterns.has(d.type));
  }

  static createDefault(): PatternRegistry {
    const registry = new PatternRegistry();
    registry.register(new DirectHandoffPattern());
    registry.register(new SupervisorOrchestrationPattern());
    registry.register(new CompetitivePattern());
    return registry;
  }
}

// Singleton
let instance: PatternRegistry | null = null;

export function getPatternRegistry(): PatternRegistry {
  if (!instance) {
    instance = PatternRegistry.createDefault();
  }
  return instance;
}

export function resetPatternRegistry(): void {
  instance = null;
}
