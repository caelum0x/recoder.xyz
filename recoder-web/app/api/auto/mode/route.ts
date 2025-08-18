import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { OpenRouterHandler } from '@/lib/api/providers/openrouter';

interface AutoModeRequest {
  objective: string;
  codebase?: string;
  constraints?: string[];
  preferences?: {
    language?: string;
    framework?: string;
    style?: string;
    testing?: boolean;
    documentation?: boolean;
  };
  maxIterations?: number;
  autoApprove?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body: AutoModeRequest = await req.json();
    const {
      objective,
      codebase = '',
      constraints = [],
      preferences = {},
      maxIterations = 5,
      autoApprove = false
    } = body;

    if (!objective) {
      return NextResponse.json(
        { success: false, error: 'Objective is required for auto mode' },
        { status: 400 }
      );
    }

    logger.info('Starting auto mode session', { 
      objective: objective.substring(0, 100), 
      maxIterations,
      autoApprove,
      language: preferences.language
    });

    // Use Claude Sonnet 4 for autonomous coding
    const openRouter = new OpenRouterHandler({
      openRouterApiKey: process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY,
      openRouterModelId: 'anthropic/claude-sonnet-4',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1'
    });

    const results = [];
    let currentIteration = 0;
    let currentObjective = objective;
    let workingCodebase = codebase;

    while (currentIteration < maxIterations) {
      currentIteration++;
      
      logger.info(`Auto mode iteration ${currentIteration}`, { objective: currentObjective });

      const autoPrompt = `You are an autonomous AI developer working in AUTO MODE. Your job is to analyze, plan, and implement code changes to achieve the objective.

OBJECTIVE: ${currentObjective}

CURRENT CODEBASE:
${workingCodebase}

CONSTRAINTS: ${constraints.join(', ')}
PREFERENCES: ${JSON.stringify(preferences)}

ITERATION: ${currentIteration}/${maxIterations}

Your autonomous workflow:
1. ANALYZE: Understand the current state and what needs to be done
2. PLAN: Break down the objective into specific tasks
3. IMPLEMENT: Write the code changes needed
4. VALIDATE: Check for issues and potential improvements
5. NEXT STEPS: Determine if objective is complete or what to do next

Provide your response in this JSON format:
{
  "analysis": "Your analysis of the current state",
  "plan": ["List", "of", "specific", "tasks"],
  "implementation": {
    "files": {
      "filename.ext": "complete file content"
    },
    "changes": "Description of changes made"
  },
  "validation": {
    "issues": ["Any issues found"],
    "tests": "Test cases or validation approach",
    "quality": "Code quality assessment"
  },
  "status": "complete|continue|blocked",
  "nextObjective": "What to do next (if status is continue)",
  "reasoning": "Explanation of your decisions"
}

Work autonomously and make decisions based on best practices. If you need clarification, make reasonable assumptions and document them.`;

      const startTime = Date.now();
      const aiResponse = await openRouter.completePrompt(autoPrompt);
      const executionTime = Date.now() - startTime;

      let iterationResult: any;
      try {
        iterationResult = JSON.parse(aiResponse);
      } catch (parseError) {
        iterationResult = {
          analysis: 'Failed to parse AI response',
          implementation: { files: {}, changes: aiResponse },
          status: 'blocked',
          reasoning: 'Response parsing failed'
        };
      }

      // Add metadata to the result
      iterationResult.iteration = currentIteration;
      iterationResult.executionTime = `${executionTime}ms`;
      iterationResult.timestamp = new Date().toISOString();

      results.push(iterationResult);

      // Update working codebase with new implementation
      if (iterationResult.implementation?.files) {
        const fileUpdates = Object.entries(iterationResult.implementation.files)
          .map(([filename, content]) => `// ${filename}\n${content}`)
          .join('\n\n');
        workingCodebase += '\n\n' + fileUpdates;
      }

      // Check if we should continue
      if (iterationResult.status === 'complete' || iterationResult.status === 'blocked') {
        logger.info(`Auto mode ${iterationResult.status} at iteration ${currentIteration}`);
        break;
      }

      // Update objective for next iteration
      if (iterationResult.nextObjective) {
        currentObjective = iterationResult.nextObjective;
      }

      // If not auto-approve mode, break here to let user review
      if (!autoApprove && currentIteration > 1) {
        logger.info('Auto mode paused for user review');
        break;
      }
    }

    const finalStatus = results[results.length - 1]?.status || 'partial';
    const totalExecutionTime = results.reduce((sum, result) => 
      sum + parseInt(result.executionTime || '0'), 0);

    logger.info('Auto mode session completed', { 
      iterations: currentIteration,
      finalStatus,
      totalTime: `${totalExecutionTime}ms`
    });

    return NextResponse.json({
      success: true,
      message: `Auto mode completed ${currentIteration} iterations with Claude Sonnet 4`,
      data: {
        sessionId: `auto-${Date.now()}`,
        objective: objective,
        iterations: results,
        finalStatus,
        summary: {
          totalIterations: currentIteration,
          completionRate: finalStatus === 'complete' ? 100 : (currentIteration / maxIterations) * 80,
          filesCreated: results.reduce((count, result) => 
            count + Object.keys(result.implementation?.files || {}).length, 0),
          linesOfCode: workingCodebase.split('\n').length,
          executionTime: `${totalExecutionTime}ms`
        },
        finalCodebase: workingCodebase,
        aiProvider: 'OpenRouter + Claude Sonnet 4',
        capabilities: [
          'Autonomous code generation',
          'Multi-iteration refinement', 
          'Self-validation and testing',
          'Production-ready output'
        ]
      },
      recommendations: finalStatus === 'complete' ? [
        'Review the generated code thoroughly',
        'Run comprehensive tests',
        'Deploy to staging environment',
        'Monitor performance and user feedback'
      ] : [
        'Review current progress',
        'Provide additional context if needed',
        'Continue with manual refinement',
        'Break down complex objectives'
      ]
    });

  } catch (error) {
    logger.error('Auto mode failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Auto mode execution failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}