/**
 * Chat Mode Store
 * Manages the current chat mode (Build, Ask, Agent)
 * Inspired by dyad's implementation
 */
import { atom } from 'nanostores';

export type ChatMode = 'build' | 'ask' | 'agent';

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
    description: 'AI has more autonomy (shell commands, multi-step tasks)',
    icon: 'i-ph:robot',
    color: 'purple',
    systemPromptAddition: `You are in AGENT mode with FULL AUTONOMY. You can:
1. Run shell commands without explicit permission
2. Execute multi-step tasks independently
3. Debug and fix errors automatically
4. Make architectural decisions
5. Install dependencies and configure tools

AGENT WORKFLOW:
1. Analyze the task completely
2. Create a plan (but don't wait for approval)
3. Execute the plan step by step
4. Verify results and fix issues
5. Report completion

You have permission to:
- Run npm/yarn/pnpm commands
- Execute build and test scripts
- Create, modify, and delete files
- Make multiple changes in sequence
- Auto-correct errors you encounter

Be proactive. Don't ask for permission - just do it correctly the first time.`
  }
};

// Current chat mode (default to 'build')
export const currentChatMode = atom<ChatMode>('build');

/**
 * Set the current chat mode
 */
export function setChatMode(mode: ChatMode): void {
  if (!CHAT_MODES[mode]) {
    console.warn(`Unknown chat mode: ${mode}`);
    return;
  }

  currentChatMode.set(mode);
  console.log(`Chat mode switched to: ${CHAT_MODES[mode].name}`);
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
  const modes: ChatMode[] = ['build', 'ask', 'agent'];
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
