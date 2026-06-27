/**
 * SubstrateId — re-export of the canonical WorkspaceSubstrate union.
 *
 * Single source of truth: the substrate package NEVER redefines the substrate id
 * set; it imports it from @recoder/agent-os (`'tmux_worktree' | 'daytona'`).
 */
export type { WorkspaceSubstrate as SubstrateId } from '@recoder/agent-os';
