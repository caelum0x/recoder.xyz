/**
 * Mode system for Recoder Web
 * Based on Kilo Code's multi-mode architecture
 */

export type ToolGroup = 'read' | 'edit' | 'browser' | 'command' | 'mcp' | 'delegate';
export type WebToolProvider = 'openai' | 'anthropic' | 'google' | 'free-fallback';

export interface ModeDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  toolGroups: ToolGroup[];
  editRestriction?: RegExp; // Only allow editing files matching this pattern
  systemPromptAddition: string;
  color: string;
}

export const MODES: Record<string, ModeDefinition> = {
  architect: {
    id: 'architect',
    name: 'Architect',
    icon: 'i-ph:blueprint',
    description: 'Plan and design before implementation',
    toolGroups: ['read', 'browser', 'mcp'],
    editRestriction: /\.md$/,
    color: 'purple',
    systemPromptAddition: `You are in ARCHITECT mode. Your role is to:
1. Gather comprehensive information about the task
2. Ask clarifying questions when requirements are unclear
3. Create detailed implementation plans in markdown files
4. Explore the codebase thoroughly before proposing solutions
5. DO NOT write actual code - only create plans and documentation

Use readFile and listFiles to explore the codebase.
Create plans in .md files with clear steps and rationale.
When ready to implement, suggest switching to Code mode.`
  },

  code: {
    id: 'code',
    name: 'Code',
    icon: 'i-ph:code',
    description: 'Write, modify, and refactor code',
    toolGroups: ['read', 'edit', 'browser', 'command', 'mcp'],
    color: 'blue',
    systemPromptAddition: `You are in CODE mode. You have full access to:
- Read and write any files
- Run shell commands
- Search and modify the codebase

Best practices:
1. Always read files before modifying them
2. Use str_replace for targeted edits instead of regenerating files
3. Check package.json before adding imports
4. Run tests after making changes
5. Keep changes minimal and focused`
  },

  ask: {
    id: 'ask',
    name: 'Ask',
    icon: 'i-ph:question',
    description: 'Get answers and explanations',
    toolGroups: ['read', 'browser', 'mcp'],
    color: 'green',
    systemPromptAddition: `You are in ASK mode. Your role is to:
1. Answer questions about the codebase
2. Explain code, concepts, and patterns
3. Provide documentation and examples
4. Analyze existing implementations

DO NOT make changes unless explicitly asked.
Use readFile to show relevant code when explaining.
Be thorough but concise in explanations.`
  },

  debug: {
    id: 'debug',
    name: 'Debug',
    icon: 'i-ph:bug',
    description: 'Diagnose and fix software issues',
    toolGroups: ['read', 'edit', 'browser', 'command', 'mcp'],
    color: 'red',
    systemPromptAddition: `You are in DEBUG mode. Follow this systematic process:

1. UNDERSTAND: Gather information about the error
   - Read the error message carefully
   - Read the file(s) where the error occurs
   - Search for related code using grep

2. HYPOTHESIZE: Consider 5-7 possible causes
   - List them explicitly in your response
   - Rank by likelihood based on the error pattern

3. INVESTIGATE: Narrow down to 1-2 most likely causes
   - Add strategic console.log/debug statements
   - Check related files and dependencies

4. CONFIRM: Ask the user to verify your diagnosis
   - Explain what you found
   - Propose a specific fix
   - Wait for confirmation before implementing

5. FIX: Apply targeted fixes
   - Use str_replace for minimal changes
   - Verify the fix works

NEVER skip the investigation phase.
ALWAYS confirm with the user before making changes.`
  },

  orchestrator: {
    id: 'orchestrator',
    name: 'Orchestrator',
    icon: 'i-ph:flow-arrow',
    description: 'Coordinate complex multi-step tasks',
    toolGroups: ['delegate'],
    color: 'yellow',
    systemPromptAddition: `You are in ORCHESTRATOR mode. Your role is to:
1. Break complex tasks into manageable subtasks
2. Delegate each subtask to the appropriate mode
3. Track progress across all subtasks
4. Synthesize results into a coherent solution

Use delegateSubagent to assign work:
- architect: For planning and design
- code: For implementation
- debug: For fixing issues
- ask: For research and explanations

Maintain a clear task list and update status as work progresses.`
  }
};

// Tool definitions for each group
export const TOOL_GROUPS: Record<ToolGroup, string[]> = {
  read: ['readFile', 'readManyFiles', 'listFiles', 'searchFiles', 'ripGrep', 'glob'],
  edit: ['createFile', 'createFiles', 'strReplace', 'editFile', 'copyProject'],
  browser: ['webSearch', 'webFetch', 'webCrawl'],
  command: ['runShellCommand'],
  mcp: ['mcpTool'],
  delegate: ['delegateSubagent']
};

export interface WebToolProviderCapability {
  provider: WebToolProvider;
  supportsWebSearch: boolean;
  supportsWebCrawl: boolean;
  supportsAllowedDomains: boolean;
  supportsBlockedDomains: boolean;
  supportsMaxUses: boolean;
}

export const WEB_TOOL_PROVIDER_CAPABILITY_MATRIX: Record<WebToolProvider, WebToolProviderCapability> = {
  openai: {
    provider: 'openai',
    supportsWebSearch: true,
    supportsWebCrawl: false,
    supportsAllowedDomains: true,
    supportsBlockedDomains: false,
    supportsMaxUses: false,
  },
  anthropic: {
    provider: 'anthropic',
    supportsWebSearch: true,
    supportsWebCrawl: false,
    supportsAllowedDomains: true,
    supportsBlockedDomains: true,
    supportsMaxUses: true,
  },
  google: {
    provider: 'google',
    supportsWebSearch: true,
    supportsWebCrawl: false,
    supportsAllowedDomains: false,
    supportsBlockedDomains: false,
    supportsMaxUses: false,
  },
  'free-fallback': {
    provider: 'free-fallback',
    supportsWebSearch: true,
    supportsWebCrawl: true,
    supportsAllowedDomains: true,
    supportsBlockedDomains: true,
    supportsMaxUses: true,
  },
};

export function getWebProviderOrder(): WebToolProvider[] {
  return ['openai', 'anthropic', 'google', 'free-fallback'];
}

export function resolveWebToolProvider(providerHint?: string): WebToolProvider {
  const normalized = (providerHint || '').trim().toLowerCase();
  if (normalized === 'openai') return 'openai';
  if (normalized === 'anthropic') return 'anthropic';
  if (normalized === 'google' || normalized === 'gemini') return 'google';
  return 'free-fallback';
}

export function getWebToolProviderCapability(providerHint?: string): WebToolProviderCapability {
  const provider = resolveWebToolProvider(providerHint);
  return WEB_TOOL_PROVIDER_CAPABILITY_MATRIX[provider];
}

export function resolveWebToolProviderFromRuntime(provider?: string, model?: string): WebToolProvider {
  const providerNormalized = (provider || '').trim().toLowerCase();
  const modelNormalized = (model || '').trim().toLowerCase();
  const modelPrefix = modelNormalized.split('/')[0] || '';

  // Direct provider wins when explicit.
  if (providerNormalized === 'openai' || providerNormalized === 'anthropic' || providerNormalized === 'google') {
    return resolveWebToolProvider(providerNormalized);
  }

  // Model prefix often carries upstream provider in aggregator paths.
  if (modelPrefix === 'openai' || modelPrefix === 'anthropic' || modelPrefix === 'google' || modelPrefix === 'gemini') {
    return resolveWebToolProvider(modelPrefix);
  }

  // OpenRouter or unknown providers use our deterministic free fallback policy.
  return 'free-fallback';
}

export function getWebToolCapabilityPrompt(provider?: string, model?: string): string {
  const resolved = resolveWebToolProviderFromRuntime(provider, model);
  const capability = getWebToolProviderCapability(resolved);

  const crawlGuidance = capability.supportsWebCrawl
    ? 'web_crawl is supported for this provider.'
    : 'web_crawl is NOT supported for this provider. If crawling is required, set providerHint="free-fallback".';
  const allowedDomainsGuidance = capability.supportsAllowedDomains
    ? 'allowedDomains is supported.'
    : 'allowedDomains is ignored.';
  const blockedDomainsGuidance = capability.supportsBlockedDomains
    ? 'blockedDomains is supported.'
    : 'blockedDomains is ignored.';
  const maxUsesGuidance = capability.supportsMaxUses
    ? 'maxUses is supported.'
    : 'maxUses is ignored.';

  return `
<web_tool_capabilities>
ACTIVE_WEB_TOOL_PROVIDER: ${capability.provider}
${crawlGuidance}
${allowedDomainsGuidance}
${blockedDomainsGuidance}
${maxUsesGuidance}
When emitting web_search/web_crawl actions, set providerHint="${capability.provider}" unless the task requires a different supported provider.
</web_tool_capabilities>
`;
}

/**
 * Get allowed tools for a mode
 */
export function getToolsForMode(modeId: string): string[] {
  const mode = MODES[modeId];
  if (!mode) return [];

  return mode.toolGroups.flatMap(group => TOOL_GROUPS[group] || []);
}

/**
 * Check if a tool is allowed in the current mode
 */
export function isToolAllowed(modeId: string, toolName: string): boolean {
  const allowedTools = getToolsForMode(modeId);
  return allowedTools.includes(toolName);
}

/**
 * Check if editing a file is allowed in the current mode
 */
export function isEditAllowed(modeId: string, filePath: string): boolean {
  const mode = MODES[modeId];
  if (!mode) return false;

  if (!mode.toolGroups.includes('edit')) return false;
  if (!mode.editRestriction) return true;

  return mode.editRestriction.test(filePath);
}

/**
 * Get system prompt addition for a mode
 */
export function getModePrompt(modeId: string): string {
  const mode = MODES[modeId];
  return mode?.systemPromptAddition || '';
}

/**
 * Get all mode IDs
 */
export function getAllModes(): ModeDefinition[] {
  return Object.values(MODES);
}

/**
 * Get mode by ID
 */
export function getMode(modeId: string): ModeDefinition | undefined {
  return MODES[modeId];
}
