/**
 * Chat Mode Store
 * Manages the current chat mode (Build, Ask, Agent)
 * Inspired by dyad's implementation
 */
import { atom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatMode');

export type ChatMode = 'build' | 'ask' | 'agent' | 'deep-coding';

export interface ChatModeDefinition {
  id: ChatMode;
  name: string;
  description: string;
  icon: string;
  color: string;
  // System prompt modification for this mode
  systemPromptAddition: string;
}

export const CHAT_MODES: Record<ChatMode, ChatModeDefinition> = {
  build: {
    id: 'build',
    name: 'Build',
    description: 'AI writes code and creates files',
    icon: 'i-ph:hammer',
    color: 'blue',
    systemPromptAddition: `You are in BUILD mode. You have full access to:
- Create and modify any files
- Run shell commands
- Install dependencies
- Execute the complete development workflow

Generate complete, production-ready code. Create files directly using recoderAction type="file".
Don't just explain - BUILD the actual implementation.`
  },
  ask: {
    id: 'ask',
    name: 'Ask',
    description: 'AI answers questions without modifying code',
    icon: 'i-ph:question',
    color: 'green',
    systemPromptAddition: `You are in ASK mode (READ-ONLY). Your role is to:
1. Answer questions about the codebase
2. Explain code, concepts, and patterns
3. Provide documentation and examples
4. Analyze existing implementations

CRITICAL RESTRICTIONS - DO NOT VIOLATE THESE:
- Do NOT generate any <recoderArtifact> tags
- Do NOT generate any <recoderAction> tags
- Do NOT write files, run shell commands, or make any code changes
- Do NOT use recoderAction type="file", type="shell", or any other action type
- Only provide explanations, analysis, and code snippets in markdown code blocks

You may ONLY use read operations:
- readFile to show relevant code
- listFiles to explore structure
- searchFiles to find patterns

If the user asks you to build, create, modify, or implement something, politely remind them to switch to Build mode using the mode selector (or press Cmd/Ctrl + .).

Be thorough but concise in explanations. Suggest improvements but DO NOT implement them.`
  },
  agent: {
    id: 'agent',
    name: 'Agent',
    description: 'Autonomous agent: analyzes, plans, executes, verifies, and auto-fixes',
    icon: 'i-ph:robot',
    color: 'purple',
    systemPromptAddition: `You are in AGENT mode with FULL AUTONOMY. You operate as a Composer-like autonomous agent.

AGENT CAPABILITIES:
1. Analyze the codebase to understand context
2. Create a structured implementation plan
3. Execute multi-file changes autonomously
4. Run shell commands (install deps, build, test)
5. Verify the build succeeds
6. Auto-fix errors (up to 5 iterations)
7. Present changes for user review with per-file diffs

AGENT WORKFLOW:
Phase 1 - ANALYZE: Read relevant files, understand project structure
Phase 2 - PLAN: Create a step-by-step plan with specific files to create/modify
Phase 3 - EXECUTE: Write all code changes and run necessary commands
Phase 4 - VERIFY: Run build/typecheck to validate changes
Phase 5 - FIX: Auto-fix any build errors (loop up to 5 times)
Phase 6 - REVIEW: Present all changes for user acceptance

You have FULL permission to:
- Create, modify, and delete any files
- Run npm/yarn/pnpm install and build commands
- Execute test scripts
- Make architectural decisions
- Auto-correct errors without asking

Be thorough, be correct, be fast. Generate production-quality code.`
  },
  'deep-coding': {
    id: 'deep-coding',
    name: 'Deep Coding',
    description: 'Durable coding runtime with persistent session, build loops, and self-correction',
    icon: 'i-ph:terminal-window',
    color: 'orange',
    systemPromptAddition: `You are in DEEP CODING mode. You operate as a durable coding runtime with persistent state.

DEEP CODING CAPABILITIES:
1. Persistent session state across consecutive prompts
2. Direct workspace file access (read, write, edit, grep, glob)
3. Persistent shell — build/test/lint state carries across turns
4. Self-correction loops — run tsc, tests, lint after edits and auto-fix
5. Hash-anchored edits for reliable multi-turn file modification

DEEP CODING WORKFLOW:
Phase 1 - UNDERSTAND: Read existing files, grep for patterns, understand structure
Phase 2 - EDIT: Apply precise edits using hash-anchored line references
Phase 3 - VERIFY: Run build, tests, type checker after changes
Phase 4 - FIX: Auto-fix errors by re-reading files and re-editing (loop until green)
Phase 5 - SUMMARIZE: Report what changed, what passed, what failed

You operate directly on the mounted workspace. All shell state, file edits, and build results persist between turns.
Use this mode for complex multi-file refactors, bug fixes requiring investigation, and tasks that need build/test verification.`
  }
};

// Current chat mode (default to 'build')
export const currentChatMode = atom<ChatMode>('build');

/**
 * Set the current chat mode
 */
export function setChatMode(mode: ChatMode): void {
  if (!CHAT_MODES[mode]) {
    logger.warn(`Unknown chat mode: ${mode}`);
    return;
  }

  currentChatMode.set(mode);
  logger.info(`Chat mode switched to: ${CHAT_MODES[mode].name}`);
}

/**
 * Get the current chat mode definition
 */
export function getCurrentChatMode(): ChatModeDefinition {
  return CHAT_MODES[currentChatMode.get()];
}

/**
 * Get system prompt addition for current mode
 */
export function getChatModePrompt(mode?: ChatMode): string {
  const modeId = mode || currentChatMode.get();
  const modeDefinition = CHAT_MODES[modeId];

  if (!modeDefinition) return '';

  return `
<chat_mode>
MODE: ${modeDefinition.name.toUpperCase()}
${modeDefinition.systemPromptAddition}
</chat_mode>
`;
}

/**
 * Toggle between chat modes
 */
export function toggleChatMode(): ChatMode {
  const modes: ChatMode[] = ['build', 'ask', 'agent', 'deep-coding'];
  const currentIndex = modes.indexOf(currentChatMode.get());
  const nextIndex = (currentIndex + 1) % modes.length;
  const nextMode = modes[nextIndex];

  setChatMode(nextMode);
  return nextMode;
}

/**
 * Get all available chat modes
 */
export function getAllChatModes(): ChatModeDefinition[] {
  return Object.values(CHAT_MODES);
}
