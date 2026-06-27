import type { ToolCallMode } from '../../types/tool-call';
import { classifyToolModes } from './opencode-tool-mapper';

/**
 * ADAPT of `ts/oh-my-openagent/src/create-tools.ts`.
 *
 * Upstream `createTools` builds the opencode plugin's extra tool registry (skills, browser
 * automation, task system) and returns `filteredTools` after applying `disabled_*` lists.
 * That registry executes inside opencode. The runtime does not inject tools into the child
 * CLI; it instead enforces an allow/deny VIEW over whatever tools opencode reports using,
 * and classifies each into policy modes. This bridge is that view.
 */
export type OpenCodeToolView = {
  toolName: string;
  modes: readonly ToolCallMode[];
  allowed: boolean;
  deniedReason?: string;
};

/**
 * Resolve whether an observed tool call is permitted given the disabled-tools deny-list.
 * Denial here is advisory at the bridge level; the engine's policy guards remain the hard
 * enforcement point. This keeps the runtime honest: it never silently allows a denied tool.
 */
export function viewOpenCodeTool(
  toolName: string,
  disabledTools: readonly string[],
): OpenCodeToolView {
  const denied = disabledTools.some((t) => t.toLowerCase() === toolName.toLowerCase());
  return {
    toolName,
    modes: classifyToolModes(toolName),
    allowed: !denied,
    deniedReason: denied ? `tool "${toolName}" is in the runtime deny-list` : undefined,
  };
}

/** Bulk classify a set of observed tools into views (for capability reporting). */
export function viewOpenCodeTools(
  toolNames: readonly string[],
  disabledTools: readonly string[],
): readonly OpenCodeToolView[] {
  return toolNames.map((name) => viewOpenCodeTool(name, disabledTools));
}
