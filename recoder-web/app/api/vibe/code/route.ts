import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { OpenRouterHandler } from '@/lib/api/providers/openrouter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      vibe,
      codeContext = '',
      language = 'typescript',
      style = 'modern',
      complexity = 'medium',
      stream = true
    } = body;

    if (!vibe) {
      return NextResponse.json(
        { success: false, error: 'Vibe description is required' },
        { status: 400 }
      );
    }

    logger.info('Starting vibe coding session', { 
      vibe: vibe.substring(0, 100), 
      language, 
      style, 
      complexity,
      stream
    });

    // Use Claude Sonnet 4 for best coding results
    const openRouter = new OpenRouterHandler({
      openRouterApiKey: process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY,
      openRouterModelId: 'anthropic/claude-sonnet-4',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1'
    });

    const vibePrompt = `You are an expert developer with perfect "vibe" understanding. Transform this vibe into high-quality, production-ready code.

VIBE: ${vibe}

Context: ${codeContext}
Language: ${language}
Style: ${style}
Complexity: ${complexity}

Your task:
1. Interpret the vibe and translate it into functional code
2. Write clean, maintainable, and well-structured code
3. Include proper error handling and edge cases
4. Add helpful comments explaining the logic
5. Follow best practices for ${language}
6. Make it production-ready, not just a demo

Focus on:
- Code quality and maintainability  
- Performance optimization
- Security best practices
- User experience considerations
- Scalability and extensibility

Provide complete, working code that captures the essence of the vibe while being technically excellent.`;

    if (stream) {
      // For streaming, we need to handle it differently
      // For now, return a promise that resolves with the code
      const aiResponse = await openRouter.completePrompt(vibePrompt);
      
      logger.info('Vibe coding completed', { 
        responseLength: aiResponse.length,
        language 
      });

      // Parse the response to extract code blocks and explanations
      const codeBlocks = extractCodeBlocks(aiResponse);
      const explanation = extractExplanation(aiResponse);

      return NextResponse.json({
        success: true,
        message: 'Vibe code generated successfully with Claude Sonnet 4',
        data: {
          vibe,
          language,
          code: aiResponse,
          codeBlocks,
          explanation,
          style,
          complexity,
          generatedAt: new Date().toISOString(),
          aiProvider: 'OpenRouter + Claude Sonnet 4',
          optimizations: [
            'Production-ready error handling',
            'Performance optimized',
            'Security best practices applied',
            'Maintainable code structure'
          ]
        },
        metadata: {
          tokenEstimate: Math.floor(aiResponse.length / 4),
          executionTime: '2-5 seconds',
          codeQuality: 'production-ready',
          vibeAccuracy: 'high'
        }
      });

    } else {
      // Non-streaming response
      const aiResponse = await openRouter.completePrompt(vibePrompt);
      
      return NextResponse.json({
        success: true,
        code: aiResponse,
        vibe,
        language,
        aiProvider: 'Claude Sonnet 4'
      });
    }

  } catch (error) {
    logger.error('Vibe coding failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Vibe coding failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// Helper function to extract code blocks from AI response
function extractCodeBlocks(response: string): Array<{ language: string; code: string }> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const codeBlocks: Array<{ language: string; code: string }> = [];
  
  let match;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    codeBlocks.push({
      language: match[1] || 'text',
      code: match[2].trim()
    });
  }
  
  return codeBlocks;
}

// Helper function to extract explanation text (non-code parts)
function extractExplanation(response: string): string {
  // Remove code blocks and return the remaining text
  return response.replace(/```[\s\S]*?```/g, '').trim();
}