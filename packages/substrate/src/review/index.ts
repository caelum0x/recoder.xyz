/**
 * review/ barrel — reviewable-diff mechanism (design §4.8).
 *
 * Pure parsing of the `git diff --stat`/`git diff`/`git status --porcelain`
 * output both substrates collect into the shared SubstrateDiff shape. No IO, no
 * substrate-specific code — the substrate runs git (host-side or in-sandbox) and
 * feeds the captured text through `buildSubstrateDiff`.
 */
export { parseUntracked } from './untracked.js';
export { countChangedFiles } from './diff-summary.js';
export { buildSubstrateDiff } from './workspace-diff.js';
export type { RawGitDiffOutput } from './workspace-diff.js';
