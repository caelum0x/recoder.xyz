// Re-export the upstream decision factory (composed, not absorbed). Keeping a
// governance-local entry point means callers import from one barrel even though
// the implementation is owned by @recoder/agent-policy.
export { decision } from '@recoder/agent-policy';
export type { PolicyInput, PolicyAction } from '@recoder/agent-policy';
