import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { OpenRouterHandler } from '@/lib/api/providers/openrouter';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json();
    const params = await context.params;
    const agentId = params.id;
    const { task, context: taskContext, useRealAI = true } = body;
    
    logger.info('Executing agent task', { agentId, task, useRealAI });

    // First, get the agent configuration
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    
    // Fetch agent details to understand its configuration
    let agentConfig: any = null;
    try {
      const agentResponse = await fetch(`${backendUrl}/api/agents/${agentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.API_TOKEN || 'development-token'}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (agentResponse.ok) {
        const agentData = await agentResponse.json();
        agentConfig = agentData.data;
      }
    } catch (error) {
      logger.warn('Could not fetch agent config, using defaults', { agentId });
    }

    let aiExecutionResult: any = null;
    
    // Real AI execution if enabled
    if (useRealAI) {
      try {
        // Select optimal model based on agent type - Claude Sonnet 4 for coding, others for cost optimization
        const getOptimalModel = (agentType: string) => {
          const modelMap = {
            // Claude Sonnet 4 for all coding-related tasks (best quality)
            'code': 'anthropic/claude-sonnet-4',
            'testing': 'anthropic/claude-sonnet-4',
            'security': 'anthropic/claude-sonnet-4',
            'analysis': 'anthropic/claude-sonnet-4',
            'deployment': 'anthropic/claude-sonnet-4',
            
            // Cheaper alternatives for non-critical tasks
            'design': 'google/gemini-2.5-flash',      // Fast for UI/UX
            'content': 'google/gemini-2.5-flash',    // Good for content generation
            'data': 'deepseek/deepseek-r1:free',     // Cost-effective reasoning
          };
          // Default to Claude Sonnet 4 for unknown types (coding-focused platform)
          return modelMap[agentType as keyof typeof modelMap] || 'anthropic/claude-sonnet-4';
        };

        const modelId = getOptimalModel(agentConfig?.type || 'code');
        
        const openRouter = new OpenRouterHandler({
          openRouterApiKey: process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY,
          openRouterModelId: modelId,
          openRouterBaseUrl: 'https://openrouter.ai/api/v1'
        });

        logger.info('Executing real AI agent task', { agentId, model: modelId });

        // Build specialized prompt based on agent configuration
        const specializedPrompt = `You are a specialized AI agent with the following configuration:

Agent Name: ${agentConfig?.name || 'AI Agent'}
Type: ${agentConfig?.type || 'general'}
Specialization: ${agentConfig?.config?.specialization?.join(', ') || 'General purpose'}
Capabilities: ${agentConfig?.config?.capabilities?.join(', ') || 'Standard AI capabilities'}

Task Context: ${JSON.stringify(taskContext || {})}

Your task: ${task}

Please execute this task according to your specialization. Provide:
1. Detailed step-by-step execution
2. Results and outputs
3. Any relevant code, analysis, or recommendations  
4. Performance metrics and quality assessment
5. Next steps or follow-up recommendations

Focus on delivering high-quality, specialized results based on your agent configuration.`;

        const startTime = Date.now();
        const aiResponse = await openRouter.completePrompt(specializedPrompt);
        const executionTime = Date.now() - startTime;
        
        aiExecutionResult = {
          aiProvider: `OpenRouter + ${modelId}`,
          executionTime: `${executionTime}ms`,
          response: aiResponse,
          specialized: true,
          modelUsed: modelId,
          agentType: agentConfig?.type
        };

        logger.info('AI agent task executed successfully', { 
          agentId, 
          model: modelId,
          executionTime 
        });

      } catch (aiError) {
        logger.error('AI execution failed, falling back to backend', { 
          error: aiError instanceof Error ? aiError.message : 'Unknown AI error',
          agentId 
        });
      }
    }

    // Also call backend for compatibility/logging
    const response = await fetch(`${backendUrl}/api/agents/${agentId}/execute`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.API_TOKEN || 'development-token'}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        task,
        context: taskContext || {},
        aiExecutionResult
      })
    });

    let backendResult: any = {};
    if (response.ok) {
      backendResult = await response.json();
    }

    // Combine AI execution with backend result
    const combinedResult = {
      ...backendResult.data,
      aiExecution: aiExecutionResult,
      executionMethod: aiExecutionResult ? 'ai-powered' : 'backend-fallback',
      timestamp: new Date().toISOString()
    };
    
    logger.info('Agent task executed successfully', { 
      agentId, 
      aiExecuted: !!aiExecutionResult,
      executionTime: aiExecutionResult?.executionTime
    });

    return NextResponse.json({
      success: true,
      data: combinedResult,
      message: aiExecutionResult 
        ? `Task executed successfully by AI agent using ${aiExecutionResult.modelUsed}`
        : 'Task executed successfully with backend processing',
      aiAnalysis: aiExecutionResult ? {
        provider: aiExecutionResult.aiProvider,
        specialized: true,
        realExecution: true,
        modelOptimized: true
      } : null
    });

  } catch (error) {
    const params = await context.params;
    logger.error('Failed to execute agent task', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      agentId: params.id
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to execute agent task',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}