// Domain barrel — owned coordination contracts (fused from agent-os + a2a,
// extended here). Pure types + a few pure helpers; no IO.

export * from './ids';
export * from './clock';
export * from './work-lock';
export * from './lock-request';
export * from './lock-conflict';
export * from './lock-lease';
export * from './task-claim';
export * from './claim-recovery';
export * from './dependency-graph';
export * from './routing-candidate';
export * from './orchestration-pattern';
export * from './dispatch-decision';
export * from './handoff-intent';
export * from './handoff';
export * from './handoff-envelope';
export * from './delegation-chain';
export * from './squad';
export * from './squad-assignment';
export * from './presence';
export * from './work-signal';
export * from './coherence-finding';
export * from './coordination-event';
export * from './effect';
