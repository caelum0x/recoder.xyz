/**
 * workspaceGoal — the human label for a workspace: the GOAL (metadata.prompt
 * persisted by the engine at create time), never the opaque branch/workspace
 * id. When no goal was captured we fall back to a friendly, stable CODENAME
 * derived from the workspace id (e.g. "amber-otter") rather than the raw
 * `recoder/ws_<uuid>` branch. Shared by Board cards, sidebar rows, detail header.
 */
import type { Workspace } from '../types';
import { workspaceCodename } from './workspace-codename';

export function workspaceGoal(w: Workspace): string {
  const prompt = w.metadata?.prompt;
  if (typeof prompt === 'string' && prompt.trim()) return prompt;
  return workspaceCodename(w.workspaceId);
}
