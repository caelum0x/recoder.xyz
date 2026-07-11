/**
 * workspaceGoal — the human label for a workspace: the GOAL (metadata.prompt
 * persisted by the engine at create time), never the opaque branch/workspace
 * id. Falls back to the branch for records created before prompts were
 * persisted. Shared by Board cards, the sidebar rows, and the detail header.
 */
import type { Workspace } from '../types';

export function workspaceGoal(w: Workspace): string {
  const prompt = w.metadata?.prompt;
  return typeof prompt === 'string' && prompt.trim() ? prompt : w.branch;
}
