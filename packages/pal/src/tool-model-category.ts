/**
 * Tool → model-category map ported from py/pal-mcp-server.
 *
 * Sources:
 * - tools/models.py:11 (ToolModelCategory enum)
 * - tools/<tool>.py get_model_category() implementations
 * - server.py:169 (ESSENTIAL_TOOLS) and parse_disabled_tools_env / filter_disabled_tools
 * - config.py (DEFAULT_MODEL / IS_AUTO_MODE / temperatures / thinkdeep default)
 */

export type ToolModelCategory = 'extended_reasoning' | 'fast_response' | 'balanced';

export const PAL_TOOL_MODEL_CATEGORIES: Readonly<Record<string, ToolModelCategory>> = {
  // EXTENDED_REASONING — deep multi-step workflows
  thinkdeep: 'extended_reasoning',
  planner: 'extended_reasoning',
  consensus: 'extended_reasoning',
  debug: 'extended_reasoning',
  codereview: 'extended_reasoning',
  precommit: 'extended_reasoning',
  secaudit: 'extended_reasoning',
  docgen: 'extended_reasoning',
  analyze: 'extended_reasoning',
  refactor: 'extended_reasoning',
  tracer: 'extended_reasoning',
  testgen: 'extended_reasoning',
  // FAST_RESPONSE — speed and cost efficiency preferred
  chat: 'fast_response',
  apilookup: 'fast_response',
  listmodels: 'fast_response',
  version: 'fast_response',
  challenge: 'fast_response',
  // BALANCED
  clink: 'balanced',
};

export const PAL_TOOLS: readonly string[] = Object.keys(PAL_TOOL_MODEL_CATEGORIES);

/** Tools that can never be disabled (server.py:169). */
export const ESSENTIAL_TOOLS: readonly string[] = ['version', 'listmodels'];

export function getToolModelCategory(toolName: string): ToolModelCategory | undefined {
  return PAL_TOOL_MODEL_CATEGORIES[toolName];
}

export type DisabledToolsResult = {
  enabled: string[];
  disabled: string[];
  /** Names present in the env var but unknown to the tool registry. */
  unknown: string[];
  /** Essential tools that were requested for disabling but kept enabled. */
  essentialKept: string[];
};

/**
 * Filter tools per the DISABLED_TOOLS env semantics (server.py:174-232):
 * comma-separated names, whitespace trimmed, empty entries ignored,
 * essential tools always kept, unknown names reported but ignored.
 */
export function filterDisabledTools(
  tools: readonly string[],
  disabledToolsEnv: string | undefined,
): DisabledToolsResult {
  const requested = new Set(
    (disabledToolsEnv ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  );

  const known = new Set(tools);
  const unknown = [...requested].filter((name) => !known.has(name)).sort();
  const essentialKept = [...requested].filter((name) => ESSENTIAL_TOOLS.includes(name)).sort();

  const enabled = tools.filter(
    (name) => ESSENTIAL_TOOLS.includes(name) || !requested.has(name),
  );
  const disabled = tools.filter(
    (name) => !ESSENTIAL_TOOLS.includes(name) && requested.has(name),
  );

  return { enabled, disabled, unknown, essentialKept };
}

/** config.py defaults (deterministic parts only). */
export const PAL_MODEL_DEFAULTS = {
  defaultModel: 'auto',
  thinkdeepThinkingMode: 'high',
  temperatureAnalytical: 1.0,
  temperatureBalanced: 1.0,
  temperatureCreative: 1.0,
} as const;

/** config.py:31 — auto mode when DEFAULT_MODEL is "auto" (case-insensitive). */
export function isAutoMode(defaultModel: string = PAL_MODEL_DEFAULTS.defaultModel): boolean {
  return defaultModel.toLowerCase() === 'auto';
}
