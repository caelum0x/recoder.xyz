import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDockerProxyHeaders, getDockerBackendUrl } from '~/lib/http/docker-server';
import {
  loadProjectConfigPromptFromDocker,
  loadThemePromptFromDocker,
  resolvePromptMentionsBestEffort,
  resolveFileMentionsBestEffort,
} from '~/lib/services/chat/docker-enrichment';
import type { Messages } from '~/lib/types/chat';
import type { ChatMode } from '~/lib/stores/chat-mode';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Chat');

const DEBUG_CHAT = process.env.NODE_ENV !== 'production' && process.env.DEBUG_CHAT === 'true';
const BUILD_MODE_PI_TIMEOUT_MS = 20000;
const BUILD_MODE_OPENCODE_TIMEOUT_MS = 45000;
const BUILD_MODE_PREVIEW_TIMEOUT_MS = 30000;

function chatDebug(message: string, meta?: unknown) {
  if (!DEBUG_CHAT) return;
  if (typeof meta !== 'undefined') {
    logger.debug(`[chat] ${message}`, meta);
    return;
  }
  logger.debug(`[chat] ${message}`);
}

function toPlainTextContent(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        const record = part as Record<string, unknown>;
        if (typeof record.text === 'string') return record.text;
        if (typeof record.content === 'string') return record.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function buildDirectPiPrompt(systemPrompt: string, messages: Messages): string {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const lastUserText = toPlainTextContent(lastUserMessage?.content).trim();
  const conversationContext = messages
    .slice(-6)
    .map((message) => {
      const text = toPlainTextContent(message.content).trim();
      return text ? `${message.role.toUpperCase()}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  return [
    'You are the Recoder coding agent working directly inside the user sandbox.',
    'Apply file changes directly in the sandbox and return a concise summary.',
    '',
    '--- System context ---',
    systemPrompt,
    '',
    '--- Conversation ---',
    conversationContext,
    '',
    '--- Current request ---',
    lastUserText || '(no specific request)',
  ].join('\n');
}

function resolveBackendCompatibleModel(
  model: string | undefined,
  providerKeys: Record<string, string | null>,
): string | undefined {
  const normalizedModel = model?.trim().toLowerCase();
  if (!normalizedModel) {
    return undefined;
  }

  const requiredProvider =
    normalizedModel.startsWith('openrouter/')
      ? 'openrouter'
      : normalizedModel.startsWith('openai/')
        ? 'openai'
        : normalizedModel.startsWith('anthropic/')
          ? 'anthropic'
          : normalizedModel.startsWith('google/') || normalizedModel.startsWith('gemini/')
            ? 'google'
            : undefined;

  if (!requiredProvider) {
    return undefined;
  }

  return providerKeys[requiredProvider] ? model : undefined;
}

const RUNTIME_MUTATION_CANDIDATE_FILES = [
  '/src/App.tsx',
  '/src/App.jsx',
  '/src/main.tsx',
  '/src/main.jsx',
  '/src/index.css',
  '/app/page.tsx',
  '/index.html',
  '/package.json',
] as const;

async function readRuntimeMutationSnapshot(
  dockerUrl: string,
  dockerHeaders: Record<string, string>,
  projectId: string,
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    RUNTIME_MUTATION_CANDIDATE_FILES.map(async (path) => {
      try {
        const response = await fetch(
          `${dockerUrl}/api/file/${encodeURIComponent(projectId)}?path=${encodeURIComponent(path)}`,
          {
            method: 'GET',
            headers: dockerHeaders,
          },
        );

        if (response.status === 404) {
          return [path, null] as const;
        }

        const payload = await response.json().catch(async () => ({ content: await response.text() }));
        if (payload && typeof payload === 'object' && 'content' in payload) {
          return [path, typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content)] as const;
        }

        return [path, typeof payload === 'string' ? payload : JSON.stringify(payload)] as const;
      } catch {
        return [path, null] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}

function hasRuntimeMutation(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
): boolean {
  return Object.keys(after).some((path) => before[path] !== after[path]);
}

async function ensureBuildPreviewReady(
  dockerUrl: string,
  dockerHeaders: Record<string, string>,
  projectId: string,
): Promise<{ ready: boolean; previewUrl?: string; port?: number | null }> {
  const startResponse = await fetch(`${dockerUrl}/api/dev-server/start`, {
    method: 'POST',
    headers: dockerHeaders,
    body: JSON.stringify({
      projectId,
      framework: 'vite',
    }),
  }).catch(() => null);

  if (!startResponse?.ok) {
    return { ready: false, port: null };
  }

  const deadline = Date.now() + BUILD_MODE_PREVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `${dockerUrl}/api/preview/${encodeURIComponent(projectId)}/health`,
        {
          method: 'GET',
          headers: dockerHeaders,
        },
      );

      if (response.ok) {
        const payload = await response.json() as {
          previewUrl?: string;
          ports?: Array<{ port: number; responding?: boolean }>;
        };
        const responding = payload.ports?.find((entry) => entry.responding);
        if (responding) {
          return {
            ready: true,
            previewUrl: payload.previewUrl,
            port: responding.port,
          };
        }
      }
    } catch {
      // keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return { ready: false, port: null };
}

export async function action(args: ActionFunctionArgs) {
  // Dynamic imports for server-only modules
  const [
    { default: SwitchableStream },
    { chatRateLimiter, applyRateLimit, createRateLimitResponse },
    { detectAndPrepareStarter },
    { loadRecoderContext, formatContextForAI },
    { initializeRecoderDirectory },
    starterConfigModule,
    { getSystemPrompt },
  ] = await Promise.all([
    import('~/lib/.server/llm/switchable-stream'),
    import('~/lib/.server/middleware/rate-limiter'),
    import('~/lib/.server/llm/starter-injector'),
    import('~/lib/recoder-context/loader'),
    import('~/lib/recoder-context/initializer'),
    import('~/lib/.server/llm/starter-config'),
    import('~/lib/.server/llm/prompts'),
  ]);

  // Extract log function from starter config module
  const { log } = starterConfigModule;


  // Apply rate limiting
  const rateLimitResult = await applyRateLimit(args.request, chatRateLimiter);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult.headers, rateLimitResult.error);
  }

  // Add rate limit headers to successful response
  const response = await chatAction(args);

  // Add rate limit headers
  Object.entries(rateLimitResult.headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  // Support both Cloudflare and Node.js environments
  const env = (context as any)?.cloudflare?.env || process.env;

  // Import required modules
  const { detectAndPrepareStarter } = await import('~/lib/.server/llm/starter-injector');
  const { createDirectStarterResponse } = await import('~/lib/.server/llm/starter-injector');
  const { default: SwitchableStream } = await import('~/lib/.server/llm/switchable-stream');
  const { streamText } = await import('~/lib/.server/llm/stream-text');
  const { getSystemPrompt } = await import('~/lib/.server/llm/prompts');

  /**
   * FIX #2: Detect GitHub URL in user message
   * Supports various GitHub URL formats
   */
  function detectGitHubUrl(message: string): string | null {
    // Match various GitHub URL formats
    const patterns = [
      // Full HTTPS URLs
      /https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i,
      // github.com without protocol
      /github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i,
      // owner/repo format (only if surrounded by spaces or at boundaries)
      /(?:^|\s)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)(?:\s|$)/,
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        const url = match[1] || match[0];
        // Return normalized URL
        if (url.startsWith('http')) {
          return url;
        } else if (url.includes('github.com')) {
          return url;
        } else {
          // owner/repo format
          return url;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if user message requires customization beyond the starter
   */
  function checkIfNeedsCustomization(message: string): boolean {
    const customizationKeywords = [
      // Styling/theme
      'dark mode', 'light mode', 'theme', 'color', 'style', 'design',
      // Features to add
      'add', 'include', 'integrate', 'with authentication', 'with auth',
      'with payment', 'with stripe', 'with database', 'with', 
      // Modifications
      'modify', 'change', 'update', 'edit', 'custom', 'customize',
      'different', 'instead of', 'replace',
      // Specific requirements
      'i want', 'i need', 'should have', 'must have', 'need to',
      'but', 'however', 'except', 'also', 'additionally',
      // Multiple features
      'and', '&', '+',
    ];

    const lowerMessage = message.toLowerCase();
    return customizationKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Scan previous assistant messages for file actions to build conversation memory.
   * This prevents the LLM from recreating files that already exist in the project.
   */
  function extractCreatedFiles(msgs: Messages): {
    createdFiles: string[];
    modifiedFiles: string[];
    shellCommands: string[];
  } {
    const created = new Set<string>();
    const modified = new Set<string>();
    const shells: string[] = [];

    for (const msg of msgs) {
      if (msg.role !== 'assistant' || !msg.content) continue;
      const content = typeof msg.content === 'string' ? msg.content : '';

      // Match <recoderAction type="file" filePath="...">
      const filePattern = /<recoderAction\s+type="file"\s+filePath="([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = filePattern.exec(content)) !== null) {
        const filePath = match[1];
        if (created.has(filePath)) {
          // Seen before — second write counts as a modification
          modified.add(filePath);
        } else {
          created.add(filePath);
        }
      }

      // Also match the reversed attribute order: filePath before type
      const filePatternAlt = /<recoderAction\s+filePath="([^"]+)"\s+type="file"/g;
      while ((match = filePatternAlt.exec(content)) !== null) {
        const filePath = match[1];
        if (created.has(filePath)) {
          modified.add(filePath);
        } else {
          created.add(filePath);
        }
      }

      // Match shell commands
      const shellPattern = /<recoderAction\s+type="shell"[^>]*>([\s\S]*?)<\/recoderAction>/g;
      while ((match = shellPattern.exec(content)) !== null) {
        const cmd = match[1].trim();
        if (cmd) shells.push(cmd);
      }
    }

    return {
      createdFiles: Array.from(created),
      modifiedFiles: Array.from(modified),
      shellCommands: shells,
    };
  }

  /**
   * Build a concise system message that lists files already present in the project
   * so the LLM avoids recreating them.
   */
  function buildFileTrackingContext(fileInfo: {
    createdFiles: string[];
    modifiedFiles: string[];
    shellCommands: string[];
  }): string {
    // Group files by directory for readability
    const dirMap: Record<string, string[]> = {};
    for (const fp of fileInfo.createdFiles) {
      const parts = fp.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      if (!dirMap[dir]) dirMap[dir] = [];
      dirMap[dir].push(parts[parts.length - 1]);
    }

    let listing = '';
    for (const [dir, files] of Object.entries(dirMap)) {
      listing += `  ${dir}/\n`;
      for (const f of files) {
        listing += `    - ${f}\n`;
      }
    }

    // Note any npm install commands already executed
    const installs = fileInfo.shellCommands.filter(
      c => c.includes('npm install') || c.includes('pnpm install') || c.includes('yarn add')
    );

    let ctx = `FILES ALREADY IN PROJECT:\n${listing}`;

    if (fileInfo.modifiedFiles.length > 0) {
      ctx += `\nPreviously modified files:\n  ${fileInfo.modifiedFiles.join('\n  ')}\n`;
    }

    if (installs.length > 0) {
      ctx += `\nDependency installs already run:\n  ${installs.join('\n  ')}\n`;
    }

    ctx += `\nThese files already exist in the project. If the user asks to change them, use str_replace for targeted edits. Do NOT recreate files that already exist unless the user explicitly asks for a full rebuild.`;

    return ctx;
  }

  // Verify user authentication — BYOK only
  const { verifySession } = await import('~/lib/auth/session.server');

  const session = await verifySession(request);
  const hasCookie = request.headers.get('Cookie')?.includes('recoder.session_token') ||
                    request.headers.get('Cookie')?.includes('session_token');

  if (!session?.user && !hasCookie) {
    // No session and no cookie — truly unauthenticated
    const encoder = new TextEncoder();
    const errorMessage = `🔐 Authentication Required

To use the Web IDE, you need to create an account:

1. Sign up at recoder.xyz (100% free!)
2. Add your AI provider API key (OpenRouter, Anthropic, or OpenAI)
3. Come back and start coding!

💡 Why? Recoder.xyz uses your own API key so we can stay free forever!

Click here to get started: ${process.env.MAIN_SITE_URL || 'http://localhost:3000'}/auth/signup`;

    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(errorMessage));
        controller.close();
      }
    });

    return new Response(errorStream, {
      status: 401,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Error-Type': 'NOT_AUTHENTICATED',
      },
    });
  }

  // console.log(`[Chat API] Authenticated user: ${session.user.email}`);

  let messages: Messages;
  let runtimeMessages: Messages;
  let provider: string = 'openrouter'; // Default provider
  let model: string | undefined;
  let requestBody: any;
  let maxTokens: number = 32000; // Increased from 16000 to prevent file truncation in create_file (create/delete loop fix)
  let temperature: number = 0.7;
  let topP: number = 0.9;
  let topK: number = 40;
  let frequencyPenalty: number = 0;
  let presencePenalty: number = 0;
  let thinkingBudget: 'low' | 'medium' | 'high' = 'medium';

  try {
    requestBody = await request.json() as {
      messages: Messages;
      chatId?: string;
      provider?: string;
      model?: string;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      topK?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      recoderContext?: string;
      projectContext?: string;
      mode?: string; // AI mode: architect, code, ask, debug, orchestrator
      chatMode?: string; // Chat mode: build, ask, agent
      customTools?: string;
      mcpTools?: string;
      projectId?: string; // Project ID for code context awareness
      codeContext?: string; // Pre-loaded code context from client
      thinkingBudget?: 'low' | 'medium' | 'high'; // Thinking budget for reasoning models
    };

    // Extract provider and model from request
    if (requestBody.provider) {
      provider = requestBody.provider;
    }
    if (requestBody.model) {
      model = requestBody.model;
    }

    // Extract inference parameters with defaults
    maxTokens = requestBody.maxTokens || 32000;
    temperature = requestBody.temperature ?? 0.7;
    topP = requestBody.topP ?? 0.9;
    topK = requestBody.topK ?? 40;
    frequencyPenalty = requestBody.frequencyPenalty ?? 0;
    presencePenalty = requestBody.presencePenalty ?? 0;

    // Extract thinking budget (low/medium/high) for reasoning models
    if (requestBody.thinkingBudget && ['low', 'medium', 'high'].includes(requestBody.thinkingBudget)) {
      thinkingBudget = requestBody.thinkingBudget;
    }

    // console.log(`[Chat API] Provider: ${provider}, Model: ${model || 'default'}, MaxTokens: ${maxTokens}`);

    // Validate messages
    const { validateChatMessages, createValidationErrorResponse } = await import('~/lib/.server/middleware/request-validator');
    const validation = validateChatMessages(requestBody.messages);

    if (!validation.valid) {
      logger.error('Message validation failed');
      chatDebug('validation errors', validation.errors);
      return createValidationErrorResponse(validation.errors);
    }

    messages = validation.sanitized as Messages;
    runtimeMessages = JSON.parse(JSON.stringify(messages)) as Messages;
  } catch (error) {
    logger.error('Failed to parse request');
    chatDebug('parse request error', error instanceof Error ? error.message : String(error));
    throw new Response(JSON.stringify({ error: 'Invalid request format' }), {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  // Extract the last user message for starter detection
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';

  // Content security: detect prompt injection patterns in the last user message
  const { detectInjectionPatterns } = await import('~/lib/services/content-security');
  const lastUserMessageStr = typeof lastUserMessage === 'string'
    ? lastUserMessage
    : (lastUserMessage as any[]).map((c: any) => c.text || '').join('');
  const injectionCheck = detectInjectionPatterns(lastUserMessageStr);
  if (injectionCheck.risk === 'high') {
    logger.warn('[security] High-risk injection patterns detected');
    chatDebug('injection patterns', injectionCheck.patterns);
  }

  // Enterprise AI: Check for loops before processing
  const { checkForLoops, recordChatSession } = await import('~/lib/.server/llm/enterprise-integration');
  const loopCheck = await checkForLoops(messages);
  
  if (loopCheck.hasLoop) {
    logger.warn('Loop detected in conversation');
    if (loopCheck.suggestion) {
      messages.push({
        role: 'system',
        content: `⚠️ Loop detected. Suggestion: ${loopCheck.suggestion}`
      });
    }
  }

  // Enterprise AI: Record chat session (non-blocking)
  recordChatSession(`chat-${Date.now()}`, messages).catch((err) => {
    logger.warn('Chat recording failed');
    chatDebug('chat recording error', err instanceof Error ? err.message : String(err));
  });

  // Enterprise AI: Try Google Cloud AI first (if available)
  const { generateWithCloudAI, initializeCloudAI } = await import('~/lib/.server/llm/cloud-ai-integration');
  // TODO(cloud-ai): Cloud AI init is disabled because initializeCloudAI requires
  // `env.googleCloudProject` which is never set in current deployments, so it always
  // returns false and adds 1-3s of wasted latency per request. To re-enable:
  //   1. Set GOOGLE_CLOUD_PROJECT in the recoder-web environment
  //   2. Ensure Google Cloud Code Assist credentials are available
  //   3. Uncomment the line below and verify the init succeeds in staging first
  // await initializeCloudAI(env).catch(() => {});
  
  // FIX #2: Detect GitHub URL BEFORE AI processing
  const githubUrl = detectGitHubUrl(lastUserMessage);
  if (githubUrl) {
    // console.log(`🔀 GitHub URL detected: ${githubUrl}`);
    // Add ULTRA-EXPLICIT instruction to AI to ONLY use cloneGitHub
    messages.push({
      role: 'system',
      content: `🚨 CRITICAL - GITHUB REPOSITORY DETECTED 🚨

Repository: ${githubUrl}

MANDATORY REQUIREMENTS:
1. You MUST use ONLY this action: <recoderAction type="cloneGitHub" repoUrl="${githubUrl}" reason="User requested to clone this repository">
2. The cloneGitHub action MUST be the ONLY action in your entire response
3. DO NOT use any <recoderAction type="file"> actions - NOT EVEN ONE
4. DO NOT generate, create, modify, or add ANY files whatsoever
5. DO NOT suggest improvements or customizations
6. The cloned repository is complete and perfect as-is

VIOLATION CONSEQUENCES:
- Any file actions will CORRUPT the repository
- Mixing cloned files with generated files will BREAK the project
- You will cause CRITICAL ERRORS if you add anything beyond the cloneGitHub action

CORRECT RESPONSE FORMAT:
<recoderArtifact id="github-clone" title="Clone ${githubUrl}">
  <recoderAction type="cloneGitHub" repoUrl="${githubUrl}" reason="User requested to clone this repository">
    Cloning the complete repository from GitHub.
  </recoderAction>
</recoderArtifact>

That's it. Nothing else. Just the clone action.`,
    });
  }
  
  // CRITICAL FIX: Detect and prepare starter template BEFORE AI processing
  // PERF: Skip expensive template scan if the message doesn't contain creation-related keywords.
  // Saves 200-500ms on non-creation requests (edits, questions, debugging, etc.).
  const starterKeywords = /\b(build|create|make|start|new|generate|scaffold|bootstrap)\b.*\b(app|website|site|dashboard|project|tool|page|landing|portfolio|blog|store|shop)\b/i;
  const mightNeedStarter = starterKeywords.test(lastUserMessage);
  const starterInjection = mightNeedStarter
    ? await detectAndPrepareStarter(lastUserMessage)
    : { shouldInject: false as const, starterId: undefined, confidence: 0 };
  
  // If we found a matching starter template, inject it as SYSTEM context for AI
  // FIX: Previously we were injecting both an assistant message AND a follow-up user message,
  // which caused the "double AI response" bug. Now we inject as a system message only.
  if (starterInjection.shouldInject && createDirectStarterResponse) {
    // console.log(`✅ Starter detected: ${starterInjection.starterId} (confidence: ${starterInjection.confidence?.toFixed(2)})`);

    const directResponse = createDirectStarterResponse(starterInjection, lastUserMessage);

    if (directResponse) {
      // console.log('🚀 Injecting starter as context for AI to build upon');

      // FIX: Inject as a SYSTEM message instead of assistant+user message pair
      // This provides the starter template context without creating a fake conversation
      messages.push({
        role: 'system',
        content: `STARTER TEMPLATE CONTEXT:
You have access to the following starter template that matches the user's request. Use this as a foundation and build upon it to implement what the user asked for.

${directResponse}

IMPORTANT:
- Use this starter template as your base
- Generate a complete implementation that fulfills the user's request: "${lastUserMessage}"
- Create all necessary files, components, and functionality
- Don't just acknowledge the template - write the actual code!`,
      });
    }
  } else {
    // console.log('   → No starter match found, proceeding with normal AI generation');
  }

  const stream = new SwitchableStream();

  try {
    // Enterprise AI: Try code_assist for code-related queries first
    // Note: Code Assist requires Google OAuth2Client and is currently disabled
    // const isCodeQuery = lastUserMessage.match(/code|function|class|component|fix|debug|implement|python|java|rust|go|php|ruby|swift|kotlin|scala|dart|c\+\+|c#|html|css|sql|shell|bash|docker|yaml|json|xml/i);
    // if (isCodeQuery) {
    //   try {
    //     const { CodeAssistServer } = await import('~/lib/.server/llm/code_assist/server');
    //     const codeAssist = new CodeAssistServer(oauthClient, projectId, {}, sessionId, userTier);
    //     // ... code assist logic
    //   } catch (error) {
    //     console.warn('Code Assist unavailable, using standard AI:', error);
    //   }
    // }
    
    // Get .recoder/ context from request body (already parsed)
    // console.log('📖 Loading .recoder/ project context...');
    const recoderContextPrompt = requestBody.recoderContext || '';
    
    if (recoderContextPrompt) {
      // console.log(`   ✅ Loaded .recoder/ context (${recoderContextPrompt.length} chars)`);
    } else {
      // console.log('   → No .recoder/ context provided');
    }

    // Get project context from request (tracks what project is being built)
    const projectContext = requestBody.projectContext || '';
    if (projectContext) {
      // console.log('   ✅ Project context loaded');
    }

    // Get code context from client (pre-loaded file contents for context awareness)
    const codeContext = requestBody.codeContext || '';
    if (codeContext) {
      chatDebug('code context loaded', { chars: codeContext.length });
    }

    // Get custom tools from request
    const customTools = requestBody.customTools || '';

    // Get client-side MCP tools from request
    const clientMcpTools = requestBody.mcpTools || '';

    // Get AI mode from request (default to 'code')
    const aiMode = requestBody.mode || 'code';

    // Get chat mode from request (default to 'build') - Build, Ask, Agent modes
    const chatMode = requestBody.chatMode || 'build';

    // PERF: Parallelize independent async operations — MCP tools, prompts module, and API key module.
    // These three have no dependencies on each other. Saves 50-150ms from sequential imports.
    const db = (env as any).DB;
    const [mcpToolsPrompt, promptsModule, apiKeyModule, modesModule] = await Promise.all([
      // Load MCP tools (only if DB is available - Cloudflare D1)
      db
        ? import('~/lib/.server/mcp/tools-loader').then(m => m.loadMCPTools(db)).catch(() => '')
        : Promise.resolve(''),
      // Import prompts module
      import('~/lib/.server/llm/prompts'),
      // Import API key module
      import('~/lib/.server/llm/api-key'),
      // Import mode/provider capability module
      import('~/lib/modes/types'),
    ]);

    if (mcpToolsPrompt) {
      // console.log('   ✅ MCP tools loaded');
    }

    // Get enhanced system prompt with coding excellence guidelines and append all context (with mode)
    const { getEnhancedSystemPrompt, CODING_EXCELLENCE_GUIDELINES, getChatModeSystemPrompt, getFrameworkPrompt } = promptsModule;
    const baseSystemPrompt = getEnhancedSystemPrompt(undefined, customTools, aiMode);
    const chatModePrompt = getChatModeSystemPrompt(chatMode as ChatMode);

    // Detect project framework using smart skills system (package.json + file patterns)
    let frameworkSkillsPrompt = '';
    try {
      const { getProjectSkills, tryExtractPackageJson } = await import('~/lib/services/framework-skills');
      // Extract file list from code context
      const fileList: string[] = [];
      const filePathMatches = codeContext.match(/(?:filePath|path)="([^"]+)"/g);
      if (filePathMatches) {
        for (const m of filePathMatches) {
          const fp = m.replace(/(?:filePath|path)="([^"]+)"/, '$1');
          if (fp) fileList.push(fp);
        }
      }
      const pkgJson = tryExtractPackageJson(codeContext);
      const { framework, skills } = getProjectSkills(fileList, pkgJson);
      if (skills) {
        frameworkSkillsPrompt = skills;
      }
      // Fallback to legacy detection if smart detection found nothing
      if (!frameworkSkillsPrompt) {
        const detectedProjectType = detectProjectTypeLegacy(projectContext, messages);
        frameworkSkillsPrompt = getFrameworkPrompt(detectedProjectType);
      }
    } catch {
      // Fallback to legacy detection
      const detectedProjectType = detectProjectTypeLegacy(projectContext, messages);
      frameworkSkillsPrompt = getFrameworkPrompt(detectedProjectType);
    }

    // Legacy framework detection fallback
    function detectProjectTypeLegacy(ctx: string, msgs: Messages): string {
      const combined = ctx.toLowerCase();
      if (combined.includes('expo') || combined.includes('react-native')) return 'expo';
      if (combined.includes('next.js') || combined.includes('nextjs')) return 'nextjs';
      if (combined.includes('vue')) return 'vue';
      if (combined.includes('django')) return 'django';
      if (combined.includes('flask')) return 'flask';
      if (combined.includes('express')) return 'express';
      for (const msg of msgs) {
        const content = typeof msg.content === 'string' ? msg.content.toLowerCase() : '';
        if (content.includes('expo') || content.includes('react-native')) return 'expo';
        if (content.includes('next.js') || content.includes('nextjs')) return 'nextjs';
      }
      if (combined.includes('package.json')) return 'react';
      return '';
    }

    const dockerUrl = getDockerBackendUrl(context);
    const dockerHeaders = createDockerProxyHeaders(request);

    const projectConfigPrompt = await loadProjectConfigPromptFromDocker(
      dockerUrl,
      requestBody.containerId || requestBody.projectId,
      dockerHeaders,
    );

    const themePrompt = await loadThemePromptFromDocker(dockerUrl, requestBody.projectId, dockerHeaders);

    const { getSessionCookie, getUserApiKey } = await import('~/lib/.server/llm/user-api-key');
    const projectSessionCookie = requestBody.projectId ? getSessionCookie(request) : null;
    const [projectOpenrouterKey, projectOpenaiKey, projectAnthropicKey, projectGoogleKey] =
      requestBody.projectId
        ? await Promise.all([
            getUserApiKey(projectSessionCookie, 'openrouter'),
            getUserApiKey(projectSessionCookie, 'openai'),
            getUserApiKey(projectSessionCookie, 'anthropic'),
            getUserApiKey(projectSessionCookie, 'google'),
          ])
        : [null, null, null, null];

    await resolvePromptMentionsBestEffort(messages, dockerUrl, dockerHeaders);
    await resolveFileMentionsBestEffort(messages, dockerUrl, requestBody.containerId || requestBody.projectId, dockerHeaders);

    // RAG context injection — additive, never blocks chat
    let ragContextPrompt = '';
    if (requestBody.projectId) {
      try {
        const { getVectorProvider, isVectorModeAvailable, queryRag } = await import('~/lib/services/rag/rag-backend');
        const ragProvider = getVectorProvider();
        const ragApiKey =
          ragProvider === 'openai'
            ? projectOpenaiKey
            : ragProvider === 'google'
              ? projectGoogleKey
              : null;

        if (isVectorModeAvailable(ragApiKey ?? undefined)) {
          const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
          const queryText = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
          if (queryText.length > 0) {
            const ragResults = await Promise.race([
              queryRag(requestBody.projectId, queryText.slice(0, 800), 5, {
                apiKey: ragApiKey ?? undefined,
              }),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('RAG timeout')), 2000)),
            ]);
            if (ragResults.length > 0) {
              const ragChunks = ragResults
                .map((r) => `[score=${r.similarity.toFixed(3)}] ${r.content}`)
                .join('\n---\n');
              ragContextPrompt = `\n<rag_context>\n${ragChunks}\n</rag_context>\n`;
            }
          }
        }
      } catch (err) {
        chatDebug('RAG context injection failed (non-blocking)', err);
      }
    }

    const { getWebToolCapabilityPrompt } = modesModule;
    const webToolCapabilityPrompt = getWebToolCapabilityPrompt(provider, model);
    let systemPrompt = baseSystemPrompt + chatModePrompt + webToolCapabilityPrompt + recoderContextPrompt + mcpToolsPrompt + clientMcpTools + projectContext + codeContext + frameworkSkillsPrompt + projectConfigPrompt + themePrompt + ragContextPrompt;
    const runtimeSystemPrompt = [
      'You are executing inside the Recoder Daytona coding runtime.',
      'Edit the real project files in the sandbox workspace directly.',
      'Do not emit recoderAction tags, recoderArtifact tags, XML, or action plans.',
      'Do not describe hypothetical edits. Make the edits on disk and return only a concise plain-English summary.',
      frameworkSkillsPrompt,
      projectConfigPrompt,
      themePrompt,
      projectContext,
      codeContext,
      ragContextPrompt,
    ].filter(Boolean).join('\n\n');

    if (
      requestBody.projectId &&
      starterInjection.shouldInject &&
      starterInjection.loadedFiles &&
      !requestBody.projectContext?.trim()
    ) {
      try {
        let workspaceStateResponse = await fetch(
          `${dockerUrl}/api/workspace-state/${encodeURIComponent(requestBody.projectId)}`,
          {
            method: 'GET',
            headers: dockerHeaders,
          },
        );

        if (workspaceStateResponse.status === 404) {
          const ensureContainerResponse = await fetch(
            `${dockerUrl}/api/container`,
            {
              method: 'POST',
              headers: dockerHeaders,
              body: JSON.stringify({ projectId: requestBody.projectId }),
            },
          );

          if (!ensureContainerResponse.ok) {
            const details = await ensureContainerResponse.text().catch(() => '');
            logger.warn(`Sandbox ensure failed for ${requestBody.projectId}: ${ensureContainerResponse.status} ${details.slice(0, 300)}`);
          } else {
            workspaceStateResponse = await fetch(
              `${dockerUrl}/api/workspace-state/${encodeURIComponent(requestBody.projectId)}`,
              {
                method: 'GET',
                headers: dockerHeaders,
              },
            );
          }
        }

        const workspaceState = workspaceStateResponse.ok
          ? await workspaceStateResponse.json() as { hasFiles?: boolean; hasPackageJson?: boolean }
          : { hasFiles: false, hasPackageJson: false };

        if (!workspaceState.hasFiles || !workspaceState.hasPackageJson) {
          const starterFiles = Object.entries(starterInjection.loadedFiles.files).map(([path, content]) => ({
            path,
            content,
          }));

          const seedResponse = await fetch(
            `${dockerUrl}/api/files/${encodeURIComponent(requestBody.projectId)}/batch`,
            {
              method: 'POST',
              headers: dockerHeaders,
              body: JSON.stringify({ files: starterFiles }),
            },
          );

          if (!seedResponse.ok) {
            const details = await seedResponse.text().catch(() => '');
            logger.warn(`Starter seed failed for ${requestBody.projectId}: ${seedResponse.status} ${details.slice(0, 300)}`);
          } else {
            logger.info(`Starter seeded into ${requestBody.projectId}: ${starterFiles.length} files`);
          }
        }
      } catch (starterSeedError) {
        logger.warn(
          `Starter seed threw for ${requestBody.projectId}: ${starterSeedError instanceof Error ? starterSeedError.message : String(starterSeedError)}`,
        );
      }
    }

    // Auto-fix action allowlist: when the user message is an auto-fix retry
    // (starts with [AUTO-FIX]), the project scaffold already exists and the
    // LLM's job is to mutate existing files, not to reset / reimport / clone.
    // Without this guard, the LLM tends to hallucinate escape hatches like
    // `cloneGitHub` when it can't diagnose the error, which blows away the
    // project and makes recovery impossible. Strip those action types from
    // the available actions for auto-fix turns only.
    //
    // Project-chat routing:
    // - `build` mode must stay on the normal coding/action path so starter seeding,
    //   file diffs, targeted edits, and follow-up preview-driven iterations work.
    // - Non-build project chats can still prefer Pi, then OpenCode, as a lighter
    //   direct-sandbox lane.
    const shouldPreferPiProjectPath =
      Boolean(requestBody.projectId) &&
      requestBody.chatMode !== 'build' &&
      requestBody.chatMode !== 'deep-coding';

    if (shouldPreferPiProjectPath) {
      try {
        const providerKeys = {
          openrouter: projectOpenrouterKey,
          openai: projectOpenaiKey,
          anthropic: projectAnthropicKey,
          google: projectGoogleKey,
        };
        const hasKeys = Object.values(providerKeys).some((value) => typeof value === 'string' && value.length > 0);
        if (!hasKeys) {
          throw new Error('No BYOK provider keys available for Pi');
        }

        const piPrompt = buildDirectPiPrompt(systemPrompt, messages);
        const piResponse = await fetch(`${dockerUrl}/api/pi/${encodeURIComponent(requestBody.projectId)}`, {
          method: 'POST',
          headers: createDockerProxyHeaders(request, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            prompt: piPrompt,
            model,
            providerKeys,
          }),
        });

        if (!piResponse.ok) {
          const details = await piResponse.text().catch(() => '');
          throw new Error(`Pi request failed (${piResponse.status}): ${details.slice(0, 200)}`);
        }

        const piResult = await piResponse.json() as {
          success?: boolean;
          text?: string;
          error?: string;
          filesChanged?: string[];
        };

        if (piResult.success === false || piResult.error) {
          throw new Error(piResult.error || piResult.text || 'Pi execution failed');
        }

        let piText = piResult.text || 'Done.';
        if (piResult.filesChanged?.length) {
          piText += `\n\n**Files changed:** ${piResult.filesChanged.join(', ')}`;
        }

        const piStream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(piText));
            controller.close();
          },
        });

        stream.switchSource(piStream);

        return new Response(stream.readable, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      } catch (piError) {
        const message = piError instanceof Error ? piError.message : String(piError);
        logger.warn(`Pi unavailable on non-build project path: ${message}`);
      }
    }

    if (requestBody.projectId && (chatMode === 'build' || chatMode === 'deep-coding')) {
      const providerKeys = {
        openrouter: projectOpenrouterKey,
        openai: projectOpenaiKey,
        anthropic: projectAnthropicKey,
        google: projectGoogleKey,
      };
      const backendModel = resolveBackendCompatibleModel(model, providerKeys as Record<string, string | null>);

      try {
        const hasKeys = Object.values(providerKeys).some((value) => typeof value === 'string' && value.length > 0);

        if (hasKeys) {
          const beforeMutation = await readRuntimeMutationSnapshot(
            dockerUrl,
            createDockerProxyHeaders(request),
            requestBody.projectId,
          );
          const piPrompt = buildDirectPiPrompt(runtimeSystemPrompt, runtimeMessages);
          const piResponse = await fetch(`${dockerUrl}/api/pi/${encodeURIComponent(requestBody.projectId)}`, {
            method: 'POST',
            headers: createDockerProxyHeaders(request, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              prompt: piPrompt,
              model: backendModel,
              providerKeys,
            }),
            signal: AbortSignal.timeout(BUILD_MODE_PI_TIMEOUT_MS),
          });

          if (piResponse.ok) {
            const piResult = await piResponse.json() as {
              success?: boolean;
              text?: string;
              error?: string;
              filesChanged?: string[];
            };
            const afterMutation = await readRuntimeMutationSnapshot(
              dockerUrl,
              createDockerProxyHeaders(request),
              requestBody.projectId,
            );
            const observedMutation = hasRuntimeMutation(beforeMutation, afterMutation);

            if (piResult.success && ((piResult.filesChanged?.length || 0) > 0 || observedMutation)) {
              let piText = piResult.text || 'Done.';
              const changedPaths = (piResult.filesChanged?.length || 0) > 0
                ? piResult.filesChanged!
                : Object.keys(afterMutation).filter((path) => beforeMutation[path] !== afterMutation[path]);
              piText += `\n\nFiles changed: ${changedPaths.join(', ')}`;
              const preview = await ensureBuildPreviewReady(
                dockerUrl,
                createDockerProxyHeaders(request, { 'Content-Type': 'application/json' }),
                requestBody.projectId,
              );
              if (preview.ready) {
                piText += `\n\nPreview ready on port ${preview.port}.`;
              } else {
                piText += '\n\nWarning: files changed but preview is not responding yet.';
              }

              const piStream = new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode(piText));
                  controller.close();
                },
              });

              stream.switchSource(piStream);

              return new Response(stream.readable, {
                status: 200,
                headers: {
                  'Content-Type': 'text/plain; charset=utf-8',
                },
              });
            }
          }
        }
      } catch (piError) {
        const message = piError instanceof Error ? piError.message : String(piError);
        logger.warn(`Build-mode Pi attempt failed, falling back to sandbox-local OpenCode: ${message}`);
      }

      const hasKeys = Object.values(providerKeys).some((value) => typeof value === 'string' && value.length > 0);
      if (!hasKeys) {
        const failureStream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('Build mode requires a configured BYOK provider key for Pi or OpenCode.'));
            controller.close();
          },
        });
        stream.switchSource(failureStream);
        return new Response(stream.readable, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      }

      const beforeMutation = await readRuntimeMutationSnapshot(
        dockerUrl,
        createDockerProxyHeaders(request),
        requestBody.projectId,
      );

      try {
        const opencodeResponse = await fetch(`${dockerUrl}/api/opencode/${encodeURIComponent(requestBody.projectId)}`, {
          method: 'POST',
          headers: createDockerProxyHeaders(request, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            prompt: buildDirectPiPrompt(runtimeSystemPrompt, runtimeMessages),
            model: backendModel,
            providerKeys,
            forceSandboxLocal: true,
          }),
          signal: AbortSignal.timeout(BUILD_MODE_OPENCODE_TIMEOUT_MS),
        });

        const opencodeResult = await opencodeResponse.json().catch(async () => ({ text: await opencodeResponse.text() })) as {
          success?: boolean;
          text?: string;
          error?: string;
          syncedFiles?: string[];
        };
        const afterMutation = await readRuntimeMutationSnapshot(
          dockerUrl,
          createDockerProxyHeaders(request),
          requestBody.projectId,
        );
        const observedMutation = hasRuntimeMutation(beforeMutation, afterMutation);

        if (opencodeResponse.ok && opencodeResult.success !== false && ((opencodeResult.syncedFiles?.length || 0) > 0 || observedMutation)) {
          let opencodeText = opencodeResult.text || 'Done.';
          const changedPaths = (opencodeResult.syncedFiles?.length || 0) > 0
            ? opencodeResult.syncedFiles!
            : Object.keys(afterMutation).filter((path) => beforeMutation[path] !== afterMutation[path]);
          opencodeText += `\n\nFiles changed: ${changedPaths.join(', ')}`;
          const preview = await ensureBuildPreviewReady(
            dockerUrl,
            createDockerProxyHeaders(request, { 'Content-Type': 'application/json' }),
            requestBody.projectId,
          );
          if (preview.ready) {
            opencodeText += `\n\nPreview ready on port ${preview.port}.`;
          } else {
            opencodeText += '\n\nWarning: files changed but preview is not responding yet.';
          }

          const opencodeStream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(opencodeText));
              controller.close();
            },
          });

          stream.switchSource(opencodeStream);

          return new Response(stream.readable, {
            status: 200,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
            },
          });
        }
      } catch (opencodeError) {
        const message = opencodeError instanceof Error ? opencodeError.message : String(opencodeError);
        logger.warn(`Build-mode sandbox-local OpenCode failed: ${message}`);
      }

      const failureStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Build mode failed to produce any observable sandbox file mutation via Pi or sandbox-local OpenCode.'));
          controller.close();
        },
      });
      stream.switchSource(failureStream);
      return new Response(stream.readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    if (provider.toLowerCase() === 'opencode') {
      const { executeOpencodeChat } = await import('~/lib/.server/llm/opencode-exec');
      const opencodeStream = await executeOpencodeChat({
        context,
        request,
        projectId: requestBody.projectId || '',
        chatId: requestBody.chatId,
        model,
        systemPrompt,
        messages,
      });

      stream.switchSource(opencodeStream);

      return new Response(stream.readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    // Get API key (User's BYOK > Environment variable)
    const { getAPIKey } = apiKeyModule;
    const apiKey = await getAPIKey(env, request, provider);

    if (!apiKey) {
      // User hasn't configured API key - return helpful error
      const encoder = new TextEncoder();
      const providerUrls: Record<string, string> = {
        openrouter: 'https://openrouter.ai/keys',
        anthropic: 'https://console.anthropic.com/settings/keys',
        openai: 'https://platform.openai.com/api-keys',
      };

      const providerNames: Record<string, string> = {
        openrouter: 'OpenRouter',
        anthropic: 'Anthropic',
        openai: 'OpenAI',
      };

      const errorMessage = `🔑 No ${providerNames[provider] || provider} API Key Configured

To use AI features with ${providerNames[provider] || provider}, please add your API key:

1. Go to Settings → AI Providers
2. Click "Add ${providerNames[provider] || provider} API Key"
3. Get your key from: ${providerUrls[provider] || 'your provider dashboard'}
4. Add it and start coding!

💡 Recoder.xyz is 100% free - you just need to bring your own API key!`;

      const errorStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(errorMessage));
          controller.close();
        }
      });

      return new Response(errorStream, {
        status: 200, // Return 200 so frontend displays the message
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Error-Type': 'NO_API_KEY',
        },
      });
    }

    // 🔧 AGENTIC BEHAVIOR: Inject few-shot examples, planning, and quality enforcement
    // PERF: Parallelize independent module imports. Saves 50-150ms.
    const [fewShotModule, planningModule] = await Promise.all([
      import('~/lib/.server/llm/few-shot-examples'),
      import('~/lib/.server/llm/planning-enforcer'),
    ]);
    const { injectFewShotExamples, getFewShotExamples } = fewShotModule;
    const {
      injectPlanningContext,
      isErrorFixRequest,
      isModificationRequest,
      isNewProjectRequest,
      classifyRequest,
      getQualityEnforcementPrompt,
      getOneShotPrompt,
    } = planningModule;

    // Check if there are existing files (from previous messages or context)
    const hasExistingFiles = messages.some(
      m =>
        m.content?.includes('type="file"') ||
        m.content?.includes('Created') ||
        m.content?.includes('package.json')
    );

    // Get the last user message
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';

    // Conversation memory: track files created in earlier turns to prevent duplicates
    const fileInfo = extractCreatedFiles(messages);
    if (fileInfo.createdFiles.length > 0) {
      const trackingContext = buildFileTrackingContext(fileInfo);
      messages.push({
        role: 'system',
        content: trackingContext,
      });
    }

    // Classify the request type
    const requestType = classifyRequest(lastUserMsg);

    // Always inject few-shot examples for quality (they now include quality guidance)
    messages = injectFewShotExamples(messages, lastUserMsg) as Messages;

    // For new projects: inject one-shot generation prompt
    if (requestType === 'new_project' || requestType === 'new_project_complex') {
      const oneShotPrompt = getOneShotPrompt(lastUserMsg, requestType === 'new_project_complex');
      messages.push({
        role: 'system',
        content: oneShotPrompt,
      });
    }

    // For edits on existing projects: wire in edit-intent analysis (best-effort)
    if (hasExistingFiles && (requestType === 'feature_add' || requestType === 'ui_change' || requestType === 'bug_fix' || requestType === 'refactor')) {
      try {
        const projectId = requestBody.projectId;

        // PERF: If the client already sent rich code context, skip the redundant
        // server-side Docker fetch. The client-side ProjectContextCache already
        // loaded and cached the project files.
        const clientSentContext = !!codeContext && codeContext.length > 100;

        // PERF: Start edit-intent module import and project context loading in parallel.
        // Both are async I/O that can overlap. Saves 500-1000ms on edit requests with projectId.
        const [editIntentModule, loadedProjectCtx] = await Promise.all([
          import('~/lib/services/edit-intent'),
          // Speculatively load project context — skip if client already sent it
          (projectId && !clientSentContext)
            ? import('~/lib/services/code-context')
                .then(m => m.loadProjectContext(projectId))
                .catch(() => null)
            : Promise.resolve(null),
        ]);

        const { analyzeEditIntent, analyzeEditIntentAsync, generateFocusedContext, EditType } = editIntentModule;

        // Use async version with project context if projectId is available
        let editIntent;
        if (projectId) {
          try {
            editIntent = await analyzeEditIntentAsync(lastUserMsg, projectId);
          } catch {
            // Fall back to sync version if async fails (e.g., Docker API unavailable from server)
            editIntent = analyzeEditIntent(lastUserMsg, null);
          }
        } else {
          editIntent = analyzeEditIntent(lastUserMsg, null);
        }

        if (editIntent) {
          // Route to different strategies based on intent type
          let strategyPrompt = '';
          const isStarterLeafTarget = editIntent.targetFiles.some((file) =>
            ['src/App.tsx', 'src/App.jsx', 'app/page.tsx', 'index.html', 'src/index.css'].includes(file)
          );
          const buildModeIsActive = requestBody.chatMode === 'build';

          switch (editIntent.type) {
            case EditType.FULL_REBUILD:
              strategyPrompt = `FULL REBUILD DETECTED:
The user wants to rebuild the application. Generate all files from scratch.
- Create package.json FIRST with every dependency
- Include all config files
- Build complete, working application`;
              break;

            case EditType.UPDATE_STYLE:
              strategyPrompt = `STYLE UPDATE DETECTED:
The user wants visual/styling changes only.
- Focus ONLY on CSS/style-related changes
- Do NOT modify component logic or structure
- Prefer Tailwind classes over custom CSS
- Maintain responsive design and dark mode support
Target files: ${editIntent.targetFiles.join(', ') || 'auto-detect from styles'}`;
              break;

            case EditType.ADD_DEPENDENCY:
              strategyPrompt = `DEPENDENCY ADDITION DETECTED:
The user wants to add a new package/library.
- Update package.json dependencies
- Add necessary import statements
- Create integration code if needed
- Run npm install after`;
              break;

            case EditType.ADD_FEATURE:
              strategyPrompt = `NEW FEATURE DETECTED:
The user wants to add a new feature.
- Read existing files first to understand the architecture
- Create new component/page files as needed
- Update routing if adding a new page
- Update parent components to integrate the new feature
Target files to modify: ${editIntent.targetFiles.join(', ') || 'auto-detect'}`;
              break;

            default:
              // UPDATE_COMPONENT, FIX_ISSUE, REFACTOR, GENERAL_QUERY
              strategyPrompt = `SURGICAL EDIT INSTRUCTIONS:
You are a surgeon — make precise, targeted changes. Do NOT regenerate entire files.

Edit type: ${editIntent.type}
Confidence: ${editIntent.confidenceLevel} (${Math.round(editIntent.confidence * 100)}%)
${editIntent.targetFiles.length > 0 ? `Predicted target files: ${editIntent.targetFiles.join(', ')}` : ''}
${editIntent.suggestedContext.length > 0 ? `Related context files: ${editIntent.suggestedContext.join(', ')}` : ''}

RULES:
- Use str_replace for targeted edits on existing files
- NEVER overwrite config files (vite.config, tsconfig, tailwind.config, postcss.config)
- Read target files first with readFile before modifying
- For follow-up edits on existing files, prefer readFile includeLineHashes="true" and reuse lineRef/startLineRef/endLineRef on edit actions so stale edits are rejected
- Only change what the user asked for — nothing else`;
              break;
          }

          if (buildModeIsActive) {
            strategyPrompt += `

BUILD MODE FOLLOW-UP RULES:
- If a target file already exists, DO NOT invent oldString snippets.
- Only emit str_replace when the oldString appears verbatim in the provided file context or in a prior readFile result.
- If you do not have an exact oldString match, use readFile includeLineHashes="true" first, then use lineRef/startLineRef/endLineRef on the edit action.
- For small leaf UI files such as src/App.tsx, app/page.tsx, index.html, or src/index.css, prefer a complete type="file" rewrite over brittle str_replace when the requested change is mostly visual/layout text changes.
- Never rewrite config files unless the user explicitly asked for that file.
`;
          }

          if (isStarterLeafTarget) {
            strategyPrompt += `

STARTER-BASED FILE SAFETY:
- This looks like a starter-based leaf file.
- Prefer replacing the full target component/page file with a coherent updated version instead of guessing two separate str_replace operations.
- Do NOT target placeholder wrappers like <div className="App"> unless that exact text exists in the provided context.
`;
          }

          messages.push({
            role: 'system',
            content: strategyPrompt,
          });

          // Inject focused file context if we have project context and target files
          // PERF: loadedProjectCtx was pre-fetched in parallel above — no extra await needed
          if (editIntent.targetFiles.length > 0 && projectId && loadedProjectCtx) {
            try {
              const focusedContext = generateFocusedContext(editIntent, loadedProjectCtx, 6000);
              if (focusedContext) {
                messages.push({
                  role: 'system',
                  content: focusedContext,
                });
              }
            } catch (ctxErr) {
              logger.warn('Failed to load focused context (non-critical)');
              chatDebug('focused context error', ctxErr instanceof Error ? ctxErr.message : String(ctxErr));
            }
          }
        }
      } catch (e) {
        // Best-effort: edit-intent is optional, don't fail the request
        logger.warn('Edit intent analysis failed (non-critical)');
        chatDebug('edit intent analysis error', e instanceof Error ? e.message : String(e));
      }
    }

    // Inject planning context for modifications/fixes
    if (isErrorFixRequest(lastUserMsg) || isModificationRequest(lastUserMsg)) {
      messages = injectPlanningContext(messages, hasExistingFiles) as Messages;
    }

    // When the client already sent file context, instruct the model to skip exploration
    // and immediately output file write actions for modification requests.
    if (codeContext && codeContext.length > 100 &&
        (isErrorFixRequest(lastUserMsg) || isModificationRequest(lastUserMsg))) {
      messages.push({
        role: 'system',
        content: `FILE CONTEXT ALREADY PROVIDED: The <project_context> section above contains the current file contents for this project.
You do NOT need to use readFile, listFiles, or searchFiles — you already have the information.
IMMEDIATELY output <recoderAction type="str_replace"> or <recoderAction type="file"> actions to implement the requested change.
If you need to make a second-pass targeted edit after re-reading a file, use readFile includeLineHashes="true" and then send anchored lineRef/startLineRef/endLineRef attributes with the edit action.
Do NOT say "I will update..." without also outputting the actual action tags in this same response.`,
      });
    }

    // Inject quality enforcement prompt for all requests
    const qualityPrompt = getQualityEnforcementPrompt(requestType);
    if (qualityPrompt) {
      messages.push({
        role: 'system',
        content: qualityPrompt,
      });
    }

    // For new projects, prepend one few-shot example conversation to teach the model by example.
    // getFewShotExamples returns FewShotMessage[] — an array of { role, content } objects.
    // We extract the first user+assistant pair and prepend it before the actual conversation.
    if (requestType === 'new_project' || requestType === 'new_project_complex') {
      const examples = getFewShotExamples(typeof lastUserMsg === 'string' ? lastUserMsg : '');
      if (examples?.length >= 2) {
        // Find the first user message and first assistant message to form an example pair
        const exampleUser = examples.find(e => e.role === 'user');
        const exampleAssistant = examples.find(e => e.role === 'assistant');
        if (exampleUser && exampleAssistant) {
          messages = [
            { role: 'user' as const, content: exampleUser.content },
            { role: 'assistant' as const, content: exampleAssistant.content },
            ...messages,
          ] as Messages;
        }
      }
    }

    // --- Context compaction: prevent context overflow on long conversations ---
    // Runs after ALL prompt assembly is complete so it can measure the true
    // token footprint and decide whether to compact.
    try {
      const { compactMessages } = await import('~/lib/services/context-compaction');
      const { estimateTokens: estimateSystemTokens } = await import('~/lib/services/token-counter');
      const selectedModel = model || 'default';
      const systemPromptTokens = estimateSystemTokens(systemPrompt);
      const compaction = compactMessages(messages, selectedModel, systemPromptTokens);

      if (compaction.wasCompacted) {
        chatDebug(
          `[context-compaction] Compacted ${compaction.summarizedCount} messages: ` +
          `${compaction.originalTokens} -> ${compaction.compactedTokens} tokens`,
        );
        messages = compaction.messages as Messages;
      }
    } catch (compactionError) {
      // Non-critical: compaction failure must never break the chat request
      logger.warn('[context-compaction] Compaction failed (non-critical)');
      chatDebug(
        'context compaction error',
        compactionError instanceof Error ? compactionError.message : String(compactionError),
      );
    }

    // Route to the correct provider's streaming function using the unified provider registry
    // This supports: OpenAI, Anthropic, Google, Groq, DeepSeek, Ollama, and OpenRouter
    const {
      createProviderStream,
      getProviderConfig,
    } = await import('~/lib/.server/llm/provider-registry');

    // Define supported provider types
    type SupportedProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'deepseek' | 'ollama' | 'openrouter';
    const supportedProviders: SupportedProvider[] = ['openai', 'anthropic', 'google', 'groq', 'deepseek', 'ollama', 'openrouter'];

    let aiStream: ReadableStream<Uint8Array>;
    const normalizedProvider = provider.toLowerCase() as SupportedProvider;

    // Check if it's a supported provider in the new registry
    if (supportedProviders.includes(normalizedProvider)) {
      // Get default model for the provider if not specified
      const providerConfig = getProviderConfig(normalizedProvider);
      const modelToUse = model || providerConfig.defaultModel;

      // Build thinking/reasoning provider options (best-effort, null if unsupported)
      let thinkingProviderOptions: Record<string, any> = {};
      try {
        const { getThinkingProviderOptions } = await import('~/lib/services/thinking-budget');
        const opts = getThinkingProviderOptions(modelToUse, thinkingBudget);
        if (opts) {
          thinkingProviderOptions = opts;
        }
      } catch {
        // Thinking budget is best-effort - if it fails, continue without it
      }

      // Build provider-native tools (e.g., web search) when available
      let nativeTools: import('~/lib/.server/llm/provider-registry').ProviderNativeTool[] = [];
      try {
        const { buildToolSet } = await import('~/lib/services/language-model-registry/tools/build-tool-set');
        const { buildWebSearchTools } = await import('~/lib/.server/llm/web-tool-injector');
        const toolSet = buildToolSet({ provider: normalizedProvider, model: modelToUse });
        nativeTools = buildWebSearchTools(toolSet.webSearch);
      } catch {
        // Tool injection is best-effort — fall back to XML-based search
      }

      const streamOptions = {
        model: modelToUse,
        temperature,
        top_p: topP,
        top_k: topK,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        max_tokens: maxTokens,
        // Pass env for OpenRouter API key rotation (ignored by other providers)
        env: env as Record<string, string | undefined>,
        // Provider-specific thinking/reasoning options (merged into API request body)
        ...thinkingProviderOptions,
        // Provider-native tools (web search, etc.) — empty array when unavailable
        ...(nativeTools.length > 0 ? { tools: nativeTools } : {}),
      };

      // Use the unified provider registry for all supported providers
      aiStream = await createProviderStream(
        normalizedProvider,
        systemPrompt,
        messages,
        apiKey,
        streamOptions
      );
    } else {
      // Fallback to legacy providers (for backward compatibility)
      const streamOptions = {
        model,
        temperature,
        top_p: topP,
        top_k: topK,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        max_tokens: maxTokens,
      };

      switch (provider.toLowerCase()) {
        case 'openrouter': {
          const { streamOpenRouterResponse } = await import('~/lib/.server/llm/openrouter-stream');
          aiStream = await streamOpenRouterResponse(
            systemPrompt,
            messages,
            apiKey,
            {
              ...streamOptions,
              model: model || 'openai/gpt-4o-mini',
              env: env as Record<string, string | undefined>,
            }
          );
          break;
        }

        case 'anthropic': {
          const { streamAnthropicResponse } = await import('~/lib/.server/llm/anthropic-stream');
          aiStream = await streamAnthropicResponse(
            systemPrompt,
            messages,
            apiKey,
            {
              ...streamOptions,
              model: model || 'claude-sonnet-4-5-20250929',
            }
          );
          break;
        }

        case 'openai': {
          const { streamOpenAIResponse } = await import('~/lib/.server/llm/openai-stream');
          aiStream = await streamOpenAIResponse(
            systemPrompt,
            messages,
            apiKey,
            {
              ...streamOptions,
              model: model || 'gpt-4-turbo-preview',
            }
          );
          break;
        }

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    }

    stream.switchSource(aiStream);

    return new Response(stream.readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    logger.error('Chat action error:', errorMessage);
    if (DEBUG_CHAT && error instanceof Error) {
      chatDebug('chat error details', {
        name: error.name,
        stack: error.stack,
      });
    }

    // Return user-friendly error as streamed text (so it shows in chat)
    const encoder = new TextEncoder();
    let userMessage = '❌ An error occurred while processing your request.';
    
    // Check for common error types
    if (errorMessage.includes('maximum prompt length') || (errorMessage.includes('tokens') && !errorMessage.includes('credits'))) {
      userMessage = `⚠️ Context Too Large

The conversation has grown too large for the AI model to process. 

**Solutions:**
1. Start a new chat for your next task
2. Try a model with larger context (Claude 3.5 Sonnet supports 200K tokens)
3. Remove some earlier messages from the conversation

The current request had too many tokens for the selected model's limit.`;
    } else if (errorMessage.includes('credits') || errorMessage.includes('can only afford')) {
      userMessage = `💳 Insufficient Credits

Your OpenRouter account doesn't have enough credits for this request.

**Solutions:**
1. Add more credits at https://openrouter.ai/settings/credits
2. Try a cheaper model
3. Use a different AI provider`;
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      userMessage = `⏳ Rate Limited

You've made too many requests. Please wait a moment and try again.`;
    } else if (errorMessage.includes('invalid_api_key') || errorMessage.includes('401')) {
      userMessage = `🔑 Invalid API Key

Your API key appears to be invalid or expired. Please check your API key in Settings → AI Providers.`;
    } else if (errorMessage.includes('insufficient_quota') || errorMessage.includes('402')) {
      userMessage = `💳 Insufficient Credits

Your API account has run out of credits. Please add more credits to your provider account.`;
    }

    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(userMessage));
        controller.close();
      }
    });

    return new Response(errorStream, {
      status: 200, // Return 200 so the message displays in chat
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Error-Type': 'AI_ERROR',
      },
    });
  }
}
