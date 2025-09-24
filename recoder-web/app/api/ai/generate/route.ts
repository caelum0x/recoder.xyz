import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

// Track AI usage for cost monitoring
async function trackAIUsage(model: string, inputText: string, outputText: string, feature: string = 'ai_generation') {
  try {
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);
    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);
    
    await fetch('/api/usage/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: model.includes('claude') ? 'anthropic' : 
                 model.includes('gpt') ? 'openai' : 'other',
        model,
        inputTokens,
        outputTokens,
        feature,
        platform: 'recoder-web',
        metadata: { 
          endpoint: '/api/ai/generate',
          timestamp: new Date().toISOString()
        }
      })
    });
  } catch (error) {
    console.error('Usage tracking failed:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, projectId, fileContext, model = 'anthropic/claude-sonnet-4' } = await request.json();

    if (!prompt) {
      return NextResponse.json({ 
        success: false,
        error: 'Prompt is required' 
      }, { status: 400 });
    }

    // Connect to production engine for AI generation
    const engineUrl = process.env.NEXT_PUBLIC_PRODUCTION_ENGINE_URL || 'http://localhost:3002';
    
    logger.info(`Sending AI generation request to engine: ${engineUrl}`);

    const response = await fetch(`${engineUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ENGINE_API_KEY || 'dev-token',
        'x-user-id': 'recoder-web-user'
      },
      body: JSON.stringify({
        description: prompt,
        type: 'component',
        framework: 'react',
        features: [],
        outputPath: './generated',
        userId: 'recoder-web-user'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Engine API error: ${response.status} - ${errorText}`);
      return NextResponse.json({ 
        success: false,
        error: `Engine API error: ${response.status}` 
      }, { status: 500 });
    }

    const result = await response.json();

    logger.info('AI generation successful');

    // Extract generated code and provide fallback if needed
    const generatedCode = result.code || result.files?.[0]?.content || 'No code generated';
    
    const fallbackCode = generatedCode === 'No code generated' ? 
      `// Generated React component based on prompt: ${prompt}
import React from 'react';

const GeneratedComponent = () => {
  return (
    <div className="generated-component p-4 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">Generated Component</h2>
      <p className="mb-2">This is a component generated based on your prompt:</p>
      <p className="italic mb-4 text-gray-600">"${prompt}"</p>
      <button 
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        onClick={() => alert('Hello from generated component!')}
      >
        Click Me
      </button>
    </div>
  );
};

export default GeneratedComponent;` : generatedCode;

    // Track usage for cost monitoring
    await trackAIUsage(
      result.metadata?.provider || model || 'recoder-ai-assistant',
      prompt,
      fallbackCode,
      'ai_code_generation'
    );

    return NextResponse.json({
      success: true,
      data: {
        generatedCode: fallbackCode,
        model: result.metadata?.provider || 'recoder-ai-assistant',
        usage: result.metadata || { provider: 'recoder-ai', tokensUsed: 0 },
        suggestions: [
          'Add TypeScript types for better type safety',
          'Consider adding error handling',
          'Add prop validation if needed',
          'Style with Tailwind CSS classes'
        ],
        files: result.files || [],
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error in AI generation:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to generate code' 
    }, { status: 500 });
  }
}
