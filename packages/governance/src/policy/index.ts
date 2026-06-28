export * from './engine';
export * from './decision';
export * from './policy-port';
export * from './rules';
export * from './evaluators';

// Re-export the upstream evaluatePolicy under its original name for callers that
// want the *unfused* upstream chain (one-minor-version compatibility seam).
export { evaluatePolicy } from '@recoder/agent-policy';
