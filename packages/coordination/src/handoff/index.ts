/**
 * handoff barrel — the A2A handoff bus module. Fuses the docker-backend a2a
 * event-bus dedup, autonomous-routing intent/flow, delegation-chain depth+cycle,
 * and context-bridge transfer into one pure-core/effects module.
 */

export * from './handoff-parser';
export * from './depth-guard';
export * from './cycle-detector';
export * from './dedup-ledger';
export * from './envelope-codec';
export * from './handoff-events';
export * from './delegation-chain-service';
export * from './context-transfer';
export * from './approval-gate-adapter';
export * from './handoff-bus';
export * from './handoff-reconciler';
export * from './handoff-service';
