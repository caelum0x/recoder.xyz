/**
 * 🚀 Bolt.new AI Provider - Modernized
 *
 * Upgraded from old bolt.new architecture:
 * - FROM: Claude 3.5 Sonnet (June 2024), 8K tokens, Anthropic only
 * - TO: Claude Sonnet 4.5 (Jan 2025), 200K tokens, Multi-provider
 */

import Anthropic from '@anthropic-ai/sdk';

export interface BoltMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface BoltStreamOptions {
  model?: 'premium' | 'fast' | 'free' | 'coding';
  maxTokens?: number;
  temperature?: number;
}

// 🎯 MODEL MAPPING - Latest & Greatest
const BOLT_MODELS = {
  // Claude Sonnet 4.5 - Latest Anthropic model (Jan 2025)
  premium: 'claude-sonnet-4.5-20250129', // ✅ LATEST

  // Claude Sonnet 3.5 - Fallback for compatibility
  balanced: 'claude-3-5-sonnet-20241022',

  // Claude Haiku - Fast responses
  fast: 'claude-3-haiku-20240307',

  // For OpenRouter (when available)
  premiumOpenRouter: 'anthropic/claude-sonnet-4.5',
  codingOpenRouter: 'qwen/qwen-3-coder-480b:free',
  freeOpenRouter: 'deepseek/deepseek-r1:free',
} as const;

// 🔧 SYSTEM PROMPTS (from bolt.new)
const BOLT_SYSTEM_PROMPT = `You are Bolt, an expert AI assistant and exceptional senior software developer with vast knowledge across multiple programming languages, frameworks, and best practices.

<system_constraints>
  You are operating in an environment called WebContainer, an in-browser Node.js runtime that emulates a Linux system to some degree. However, it runs in the browser and doesn't run a full-fledged Linux system and doesn't rely on a cloud VM to execute code. All code is executed in the browser. It does come with a shell that emulates zsh. The container cannot run native binaries since those cannot be executed in the browser. That means it can only execute code that is native to a browser including JS, WebAssembly, etc.

  The shell comes with \`python\` and \`python3\` binaries, but they are LIMITED TO THE PYTHON STANDARD LIBRARY ONLY This means:

    - There is NO \`pip\` support! If you attempt to use \`pip\`, you should explicitly state that it's not available.
    - CRITICAL: Third-party libraries cannot be installed or imported.
    - Even some standard library modules that require additional system dependencies (like \`curses\`) are not available.
    - Only modules from the core Python standard library can be used.

  Additionally, there is no \`g++\` or any C/C++ compiler available. WebContainer CANNOT run native binaries or compile C/C++ code!

  Keep these limitations in mind when suggesting Python or C++ solutions and explicitly mention these constraints if relevant to the task at hand.

  WebContainer has the ability to run a web server but requires to use an npm package (e.g., Vite, servor, serve, http-server) or use the Node.js APIs to implement a web server.

  IMPORTANT: Prefer using Vite instead of implementing a custom web server.

  IMPORTANT: Git is NOT available.

  IMPORTANT: Prefer writing Node.js scripts instead of shell scripts. The environment doesn't fully support shell scripts, so use Node.js for scripting tasks whenever possible!

  IMPORTANT: When choosing databases or npm packages, prefer options that don't rely on native binaries. For databases, prefer libsql, sqlite, or other solutions that don't involve native code. WebContainer CANNOT execute arbitrary native binaries.

  Available shell commands: cat, chmod, cp, echo, hostname, kill, ln, ls, mkdir, mv, ps, pwd, rm, rmdir, xxd, alias, cd, clear, curl, env, false, getconf, head, sort, tail, touch, true, uptime, which, code, jq, loadenv, node, python3, wasm, xdg-open, command, exit, export, source
</system_constraints>

<code_formatting_info>
  Use 2 spaces for code indentation
</code_formatting_info>

<message_formatting_info>
  You can make the output pretty by using only the following available HTML elements: ${[
    '<p>',
    '<div>',
    '<h1>',
    '<h2>',
    '<h3>',
    '<h4>',
    '<h5>',
    '<h6>',
    '<strong>',
    '<code>',
    '<pre>',
    '<blockquote>',
    '<br>',
    '<hr>',
    '<li>',
    '<ol>',
    '<ul>',
  ].join(', ')}
</message_formatting_info>

<diff_spec>
  For user-made file modifications, a \`<boltAction type="file">\` action will automatically be sent to you and should include a \`<boltArtifact>\` containing the full file contents.

  For AI-made file modifications, use \`<boltAction type="file" filePath="path/to/file">\` action with \`<boltArtifact>\` containing the modified code.
</diff_spec>

<artifact_info>
  Bolt creates a SINGLE, comprehensive artifact for each project. The artifact contains all files, folders, and dependencies necessary to run the project.

  <artifact_instructions>
    1. Think HOLISTICALLY and COMPREHENSIVELY BEFORE creating an artifact. Consider ALL relevant files and dependencies.

    2. CRITICAL: Artifact will ALWAYS ERASE ALL PREVIOUS FILE MODIFICATIONS. Therefore, provide a complete artifact with all necessary files.

    3. When in doubt, USE \`<boltAction type="shell">\` action to execute shell commands before creating an artifact. For example checking package.json, current directory structure.

    4. IMPORTANT: Use coding best practices and modularize the code.

    5. The \`<boltAction type="file" filePath="...">\` tag must include a full file path.
  </artifact_instructions>
</artifact_info>`;

/**
 * 🔥 CREATE BOLT STREAM - Claude Sonnet 4.5
 */
export async function createBoltStream(
  messages: BoltMessage[],
  options: BoltStreamOptions = {}
) {
  const {
    model = 'premium',
    maxTokens = 16000,
    temperature = 0.2,
  } = options;

  // Get API keys
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  // Determine which model to use
  let modelId: string;
  let useOpenRouter = false;

  if (model === 'premium' && anthropicKey) {
    // Use Claude Sonnet 4.5 directly via Anthropic
    modelId = BOLT_MODELS.premium;
  } else if (model === 'premium' && openrouterKey) {
    // Use Claude Sonnet 4.5 via OpenRouter
    modelId = BOLT_MODELS.premiumOpenRouter;
    useOpenRouter = true;
  } else if (model === 'coding' && openrouterKey) {
    // Use Qwen Coder for specialized coding tasks
    modelId = BOLT_MODELS.codingOpenRouter;
    useOpenRouter = true;
  } else if (model === 'free' && openrouterKey) {
    // Use DeepSeek R1 for free unlimited dev
    modelId = BOLT_MODELS.freeOpenRouter;
    useOpenRouter = true;
  } else if (anthropicKey) {
    // Fallback to Claude 3.5 Sonnet
    modelId = BOLT_MODELS.balanced;
  } else {
    throw new Error('No AI API keys configured. Please add ANTHROPIC_API_KEY or OPENROUTER_API_KEY');
  }

  console.log(`🚀 Bolt AI: Using ${modelId} (${useOpenRouter ? 'OpenRouter' : 'Anthropic'})`);

  if (useOpenRouter) {
    // OpenRouter implementation
    return createOpenRouterStream(modelId, messages, { maxTokens, temperature });
  } else {
    // Anthropic implementation
    return createAnthropicStream(modelId, messages, { maxTokens, temperature });
  }
}

/**
 * 🎯 ANTHROPIC DIRECT STREAM
 */
async function createAnthropicStream(
  modelId: string,
  messages: BoltMessage[],
  options: { maxTokens: number; temperature: number }
) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Separate system messages
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  const systemPrompt = systemMessages.length > 0
    ? systemMessages.map(m => m.content).join('\n\n') + '\n\n' + BOLT_SYSTEM_PROMPT
    : BOLT_SYSTEM_PROMPT;

  const stream = await anthropic.messages.stream({
    model: modelId,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    system: systemPrompt,
    messages: conversationMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  });

  return stream;
}

/**
 * 🌐 OPENROUTER STREAM
 */
async function createOpenRouterStream(
  modelId: string,
  messages: BoltMessage[],
  options: { maxTokens: number; temperature: number }
) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://recoder.xyz',
      'X-Title': 'Recoder.xyz - Bolt AI',
    },
    body: JSON.stringify({
      model: modelId,
      messages: messages.map(m => ({
        role: m.role,
        content: m.role === 'system'
          ? m.content + '\n\n' + BOLT_SYSTEM_PROMPT
          : m.content,
      })),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  return response.body;
}

/**
 * 📝 GET BOLT SYSTEM PROMPT
 */
export function getBoltSystemPrompt() {
  return BOLT_SYSTEM_PROMPT;
}

/**
 * 🎨 PARSE BOLT ARTIFACTS
 * Extracts code blocks and file operations from AI response
 */
export function parseBoltArtifacts(response: string): {
  files: Array<{ path: string; content: string }>;
  shellCommands: string[];
} {
  const files: Array<{ path: string; content: string }> = [];
  const shellCommands: string[] = [];

  // Parse boltAction tags
  const fileActionRegex = /<boltAction type="file" filePath="([^"]+)">([\s\S]*?)<\/boltAction>/g;
  const shellActionRegex = /<boltAction type="shell">([\s\S]*?)<\/boltAction>/g;

  let match;

  // Extract file actions
  while ((match = fileActionRegex.exec(response)) !== null) {
    const filePath = match[1];
    const artifactMatch = match[2].match(/<boltArtifact[^>]*>([\s\S]*?)<\/boltArtifact>/);

    if (artifactMatch) {
      files.push({
        path: filePath,
        content: artifactMatch[1].trim(),
      });
    }
  }

  // Extract shell commands
  while ((match = shellActionRegex.exec(response)) !== null) {
    const command = match[1].trim();
    if (command) {
      shellCommands.push(command);
    }
  }

  return { files, shellCommands };
}

export default {
  createBoltStream,
  getBoltSystemPrompt,
  parseBoltArtifacts,
};
