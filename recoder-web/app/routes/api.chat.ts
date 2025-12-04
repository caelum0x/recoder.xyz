import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import type { Messages } from '~/lib/types/chat';

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

  // CRITICAL: Verify user authentication FIRST
  const { isAuthenticated, hasUserApiKey, getSessionCookie } = await import('~/lib/.server/llm/user-api-key');
  const { verifySession } = await import('~/lib/auth/session.server');

  const session = await verifySession(request);

  if (!session?.user) {
    // User not authenticated - return helpful error
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

  console.log(`[Chat API] Authenticated user: ${session.user.email}`);

  let messages: Messages;
  let provider: string = 'openrouter'; // Default provider
  let model: string | undefined;
  let requestBody: any;

  try {
    requestBody = await request.json<{
      messages: Messages;
      provider?: string;
      model?: string;
      recoderContext?: string;
      projectContext?: string;
    }>();

    // Extract provider and model from request
    if (requestBody.provider) {
      provider = requestBody.provider;
    }
    if (requestBody.model) {
      model = requestBody.model;
    }

    console.log(`[Chat API] Provider: ${provider}, Model: ${model || 'default'}`);

    // Validate messages
    const { validateChatMessages, createValidationErrorResponse } = await import('~/lib/.server/middleware/request-validator');
    const validation = validateChatMessages(requestBody.messages);

    if (!validation.valid) {
      console.error('Message validation failed:', validation.errors);
      return createValidationErrorResponse(validation.errors);
    }

    messages = validation.sanitized as Messages;
  } catch (error) {
    console.error('Failed to parse request:', error);
    throw new Response(JSON.stringify({ error: 'Invalid request format' }), {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  // Extract the last user message for starter detection
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
  
  // FIX #2: Detect GitHub URL BEFORE AI processing
  const githubUrl = detectGitHubUrl(lastUserMessage);
  if (githubUrl) {
    console.log(`🔀 GitHub URL detected: ${githubUrl}`);
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
  console.log('🔍 Checking if user request matches a starter template...');
  const starterInjection = await detectAndPrepareStarter(lastUserMessage);
  
  // If we found a matching starter template, handle it appropriately
  if (starterInjection.shouldInject && createDirectStarterResponse) {
    console.log(`✅ Starter detected: ${starterInjection.starterId} (confidence: ${starterInjection.confidence?.toFixed(2)})`);
    
    // Always return the starter - either directly or for AI to customize
    const directResponse = createDirectStarterResponse(starterInjection, lastUserMessage);
    
    if (directResponse) {
      console.log('🚀 Returning pre-loaded starter (with or without AI customization)');
      
      // Check if we need AI customization
      const needsCustomization = checkIfNeedsCustomization(lastUserMessage);
      
      if (!needsCustomization) {
        // Return directly without AI - saves 100% of AI costs!
        console.log('   → Direct return (no customization needed)');
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(directResponse));
            controller.close();
          }
        });

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      } else {
        // AI will add customizations on top of the starter
        console.log('   → AI will customize the loaded starter');
        // Prepend the starter to the conversation
        messages.push({
          role: 'assistant',
          content: directResponse,
        });
        // Add a follow-up user message for customization
        messages.push({
          role: 'user',
          content: `The base starter is loaded above. Now please add the customizations I requested: ${lastUserMessage}`,
        });
      }
    }
  } else {
    console.log('   → No starter match found, proceeding with normal AI generation');
  }

  const stream = new SwitchableStream();

  try {
    // Get .recoder/ context from request body (already parsed)
    console.log('📖 Loading .recoder/ project context...');
    const recoderContextPrompt = requestBody.recoderContext || '';
    
    if (recoderContextPrompt) {
      console.log(`   ✅ Loaded .recoder/ context (${recoderContextPrompt.length} chars)`);
    } else {
      console.log('   → No .recoder/ context provided');
    }

    // Load MCP tools
    console.log('🔧 Loading MCP tools...');
    const { loadMCPTools } = await import('~/lib/.server/mcp/tools-loader');
    const mcpToolsPrompt = await loadMCPTools(context.cloudflare.env.DB);
    
    if (mcpToolsPrompt) {
      console.log('   ✅ MCP tools loaded');
    }

    // Get project context from request (tracks what project is being built)
    const projectContext = requestBody.projectContext || '';
    if (projectContext) {
      console.log('   ✅ Project context loaded');
    }

    // Get custom tools from request
    const customTools = requestBody.customTools || '';

    // Get client-side MCP tools from request
    const clientMcpTools = requestBody.mcpTools || '';

    // Get system prompt and append all context
    const baseSystemPrompt = getSystemPrompt(undefined, customTools);
    const systemPrompt = baseSystemPrompt + recoderContextPrompt + mcpToolsPrompt + clientMcpTools + projectContext;

    // Get API key (User's BYOK > Environment variable)
    const { getAPIKey } = await import('~/lib/.server/llm/api-key');
    const apiKey = await getAPIKey(context.cloudflare.env, request, provider);

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

    // Route to the correct provider's streaming function
    let aiStream: ReadableStream<Uint8Array>;

    const streamOptions = {
      model,
      temperature: 0.7,
      max_tokens: 8000,
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
            model: model || 'x-ai/grok-code-fast-1', // Default to #1 most used model
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
            model: model || 'claude-3-5-sonnet-20241022', // Default to Claude 3.5 Sonnet
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
            model: model || 'gpt-4-turbo-preview', // Default to GPT-4 Turbo
          }
        );
        break;
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    stream.switchSource(aiStream);

    return new Response(stream.readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Chat action error:', error);

    // Log full error details for debugging
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }

    // Check if it's an API error with response body
    if (error && typeof error === 'object' && 'responseBody' in error) {
      console.error('API Response Body:', (error as any).responseBody);
    }

    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    
    // Return user-friendly error as streamed text (so it shows in chat)
    const encoder = new TextEncoder();
    let userMessage = '❌ An error occurred while processing your request.';
    
    // Check for common error types
    if (errorMessage.includes('maximum prompt length') || errorMessage.includes('tokens')) {
      userMessage = `⚠️ Context Too Large

The conversation has grown too large for the AI model to process. 

**Solutions:**
1. Start a new chat for your next task
2. Try a model with larger context (Claude 3.5 Sonnet supports 200K tokens)
3. Remove some earlier messages from the conversation

The current request had too many tokens for the selected model's limit.`;
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
