// Ports barrel — interfaces the engine depends on; adapters implement these.
// The pure core imports ONLY these (and domain), never concrete adapters.

export * from './clock';
export * from './id-generator';
export * from './lease-fencer';
export * from './lock-store';
export * from './claim-store';
export * from './dependency-store';
export * from './handoff-store';
export * from './squad-store';
export * from './presence-store';
export * from './signal-sink';
export * from './event-bus';
export * from './agent-directory';
export * from './policy-gate';
export * from './approval-gate';
export * from './metrics';
