/**
 * AI Chat API Route - Core endpoint for AI requests
 * Routes AI requests through OpenRouter with tier-based API key selection
 * Free users: Use their own API key
 * Premium users: Use platform rotating keys
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { canMakeRequest, trackUsageEvent, getApiKeyForUser } from '@/lib/usage-service';
import { getMCPTools, formatMCPToolsForAI, executeMCPTool } from '@/lib/mcp/tools-integration';

// AI Provider interfaces
interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AIRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  userId?: string;
}

interface AIResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
  provider: string;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Process AI request through OpenRouter
 * Uses appropriate API key based on user tier
 */
async function processAIRequest(
  request: AIRequest,
  apiKey: string,
  tools?: any[]
): Promise<AIResponse> {
  const startTime = Date.now();

  // Default to a good general model if none specified
  const model = request.model || 'anthropic/claude-3.5-sonnet';

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz AI Platform',
      },
      body: JSON.stringify({
        model: model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 4096,
        ...(tools && tools.length > 0 ? { tools } : {}),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
      );
    }

    const data: OpenRouterResponse = await response.json();
    const duration = Date.now() - startTime;

    // Extract response content
    const content = data.choices[0]?.message?.content || '';

    // Calculate cost (approximate - OpenRouter provides actual cost in headers)
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || (inputTokens + outputTokens);

    // Rough cost estimation (actual costs vary by model)
    const costPer1kInput = 0.003; // $3 per 1M tokens = $0.003 per 1k
    const costPer1kOutput = 0.015; // $15 per 1M tokens = $0.015 per 1k
    const estimatedCost =
      (inputTokens / 1000) * costPer1kInput +
      (outputTokens / 1000) * costPer1kOutput;

    return {
      content,
      model: data.model || model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        cost: estimatedCost,
      },
      provider: 'openrouter',
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('OpenRouter API Error:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId = '';

  try {
    // Check authentication - verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || 'development-secret') as any;
      userId = decoded.userId || decoded.id;
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: AIRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      );
    }

    // Check quota and get API key
    const requestCheck = await canMakeRequest(userId);
    if (!requestCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Request not allowed',
          reason: requestCheck.reason,
          upgradeUrl: '/pricing',
        },
        { status: 403 }
      );
    }

    const apiKey = requestCheck.apiKey!;

    // Get API key info for logging
    const apiKeyInfo = await getApiKeyForUser(userId);

    // Load MCP tools for user
    const mcpTools = await getMCPTools(userId);
    const formattedTools = formatMCPToolsForAI(mcpTools);

    // Process AI request through OpenRouter
    let aiResponse: AIResponse;
    let success = true;
    let errorMessage: string | undefined;

    try {
      aiResponse = await processAIRequest(
        {
          ...body,
          userId: userId,
        },
        apiKey,
        formattedTools
      );

      // Handle tool calls if present
      const data = aiResponse as any;
      if (data.choices?.[0]?.message?.tool_calls) {
        const toolCalls = data.choices[0].message.tool_calls;
        
        for (const toolCall of toolCalls) {
          const [serverId, toolName] = toolCall.function.name.split('_', 2);
          const args = JSON.parse(toolCall.function.arguments);
          
          try {
            await executeMCPTool(userId, serverId, toolName, args);
          } catch (error) {
            console.error('MCP tool execution failed:', error);
          }
        }
      }
    } catch (error: any) {
      success = false;
      errorMessage = error.message || 'AI request failed';

      // Track failed request
      await trackUsageEvent(userId, {
        modelUsed: body.model || 'anthropic/claude-3.5-sonnet',
        tokensUsed: 0,
        cost: 0,
        duration: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      throw error;
    }

    // Track successful usage
    await trackUsageEvent(userId, {
      modelUsed: aiResponse.model,
      tokensUsed: aiResponse.usage.totalTokens,
      cost: aiResponse.usage.cost,
      duration: Date.now() - startTime,
      success: true,
    });

    // Return response with usage info
    return NextResponse.json({
      ...aiResponse,
      meta: {
        keySource: apiKeyInfo?.source || 'unknown',
        tier: apiKeyInfo?.tier || 'free',
        duration: Date.now() - startTime,
      },
    });

  } catch (error: any) {
    console.error('AI Chat API Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint
  return NextResponse.json({ 
    status: 'healthy',
    service: 'ai-chat-api',
    timestamp: new Date().toISOString()
  });
}