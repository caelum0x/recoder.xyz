import { NextRequest, NextResponse } from 'next/server';
import { getMainCodingPrompt, screenshotToCodePrompt, softwareArchitectPrompt, getModelOptimizedPrompt, getMultiFileProjectPrompt } from "@/lib/prompts";
import { unifiedAI } from "@/lib/unified-ai-provider";
import { logger } from '@/lib/logger';
import Together from 'together-ai';

// Utility functions for response processing
function extractCodeFromResponse(content: string): string {
  // Extract code from response content
  const codeMatch = content.match(/```(?:tsx?|javascript|jsx?)?\n([\s\S]*?)```/);
  return codeMatch ? codeMatch[1].trim() : content;
}

function extractExplanationFromResponse(content: string): string {
  // Extract explanation from response, excluding code blocks
  const explanation = content.replace(/```[\s\S]*?```/g, '').trim();
  return explanation || 'Code generated successfully';
}

function calculateClaudeCost(inputTokens: number, outputTokens: number, model: string): number {
  // Claude pricing per 1M tokens
  const pricing = {
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 }
  };
  
  const modelPricing = pricing[model as keyof typeof pricing] || pricing['claude-3-5-haiku-20241022'];
  return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000000;
}

function getProviderFromModel(model: string): string {
  if (model.includes('claude')) return 'anthropic-fallback';
  if (model.includes('llama') || model.includes('deepseek') || model.includes('qwen')) return 'local-first';
  if (model.includes('groq')) return 'groq-fallback';
  if (model.includes('gemini')) return 'gemini-fallback';
  return 'openrouter-fallback';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, model, quality, screenshotUrl } = body;
    
    console.log('Creating chat via API route:', { prompt: prompt.substring(0, 50), model, quality });
    
    // Initialize Together AI for example detection
    let mostSimilarExample = "none";
    
    try {
      if (process.env.TOGETHER_API_KEY) {
        const together = new Together({
          apiKey: process.env.TOGETHER_API_KEY,
        });

        const findSimilarExamples = await together.chat.completions.create({
          model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
          messages: [
            {
              role: "system",
              content: `You are a helpful bot. Given a request for building an app, you match it to the most similar example provided. If the request is NOT similar to any of the provided examples, return "none". Here is the list of examples, ONLY reply with one of them OR "none":

              - landing page
              - blog app
              - quiz app
              - pomodoro timer
              `,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        mostSimilarExample = findSimilarExamples.choices[0].message?.content || "none";
        console.log('Detected similar example:', mostSimilarExample);
      }
    } catch (error) {
      console.warn('Failed to detect similar example, using default:', error);
      mostSimilarExample = "none";
    }
    
    // Use the AI system to generate chat response
    let messages: Array<{role: "system" | "user" | "assistant", content: string}> = [{ role: "user", content: prompt }];
    
    if (screenshotUrl) {
      // For screenshot handling, we'll use a simple text approach for now
      messages = [
        {
          role: "user",
          content: screenshotToCodePrompt + "\n\nUser request: " + prompt,
        },
      ];
    } else {
      const isArchitectureRequest = quality === "high";
      
      // 🚀 CURSOR-KILLER: Detect if user wants a complete project vs single component
      const isProjectRequest = prompt.toLowerCase().includes('app') || 
                               prompt.toLowerCase().includes('website') ||
                               prompt.toLowerCase().includes('platform') ||
                               prompt.toLowerCase().includes('system') ||
                               prompt.toLowerCase().includes('dashboard') ||
                               prompt.toLowerCase().includes('application') ||
                               prompt.length > 100 || // Long descriptions usually mean full projects
                               isArchitectureRequest; // High quality always gets full project treatment
      
      let mainPrompt: string;
      
      if (isProjectRequest) {
        // Use CURSOR-KILLER multi-file project generation
        console.log('🚀 Using MULTI-FILE PROJECT generation (Cursor Killer mode)');
        mainPrompt = getMultiFileProjectPrompt(prompt, quality);
      } else {
        // Use single component generation for simple requests
        console.log('⚡ Using single component generation');
        mainPrompt = getMainCodingPrompt(mostSimilarExample);
      }
      
      // Apply model-specific prompt optimization
      const optimizedPrompt = getModelOptimizedPrompt(model, mainPrompt, prompt);
      
      if (isArchitectureRequest || isProjectRequest) {
        const baseSystemPrompt = isArchitectureRequest ? softwareArchitectPrompt : "";
        messages = [
          { role: "system", content: baseSystemPrompt },
          { role: "system", content: optimizedPrompt },
          { role: "user", content: prompt },
        ];
      } else {
        messages = [
          { role: "system", content: optimizedPrompt },
          { role: "user", content: prompt },
        ];
      }
    }

    // Initialize the AI handler
    console.log('Initializing AI system...');
    
    // Use the unified AI provider for generation
    console.log('Generating AI response with unified provider...');
    
    // Initialize result variable
    let result: {
      code: string;
      explanation: string;
      provider: string;
      confidence: number;
      model?: string;
      tokens?: {
        input: number;
        output: number;
      };
      cost?: number;
    } | null = null;
    
    try {
      // Determine AI quality level from user selection
      const aiQuality = quality === 'high' ? 'premium' : 
                       quality === 'low' ? 'fast' : 'balanced';
      
      // Get the provider and model from the model string
      let preferredProvider: 'openrouter' | 'together' | 'local' | undefined;
      let modelId = model;
      
      if (model.includes('anthropic/') || model.includes('google/') || model.includes('deepseek/') || model.includes('openai/')) {
        preferredProvider = 'openrouter';
      } else if (model.includes('meta-llama/') || model.includes('deepseek-ai/') || model.includes('Qwen/')) {
        preferredProvider = 'together';
      }
      
      // Convert system+user messages to unified format
      const unifiedMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      }));
      
      // Generate using unified AI provider
      const response = await unifiedAI.smartGenerate(unifiedMessages, {
        preferredProvider,
        preferredModel: modelId,
        quality: aiQuality as 'fast' | 'balanced' | 'premium' | 'ultra-premium',
        temperature: 0.3,
        maxTokens: aiQuality === 'premium' ? 4000 : 2000
      });

      result = {
        code: extractCodeFromResponse(response.content),
        explanation: extractExplanationFromResponse(response.content),
        provider: response.provider,
        confidence: 0.95,
        model: response.model,
        tokens: {
          input: Math.floor((response.tokens || 0) * 0.7),
          output: Math.floor((response.tokens || 0) * 0.3)
        },
        cost: response.cost
      };

      console.log('✅ Unified AI generation successful:', {
        provider: response.provider,
        model: response.model,
        tokens: response.tokens,
        cost: response.cost
      });

    } catch (aiError) {
      console.error('❌ Unified AI generation failed:', aiError);
      // Fallback to simple response
      result = {
        code: '// AI generation temporarily unavailable. Please try again.',
        explanation: 'AI service temporarily unavailable',
        provider: 'fallback',
        confidence: 0.1
      };
    }
    
    // Create a simple response that includes the stream URL
    // For now, return a mock chat object to bypass database issues
    const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const chat = {
      id: chatId,
      model,
      quality,
      prompt,
      title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      shadcn: true,
      userId: null, // Anonymous for now
      createdAt: new Date().toISOString(),
      messages: [],
      status: 'completed',
      result: result ? {
        code: result.code,
        explanation: result.explanation,
        provider: result.provider,
        confidence: result.confidence
      } : null
    };

    // Return success response with redirect URL
    return NextResponse.json({
      success: true,
      chat,
      redirectUrl: `/chats/${chatId}`,
      hasResult: !!result
    });
    
  } catch (error) {
    console.error('Chat creation error:', error);
    logger.error('Failed to create chat', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create chat',
        details: error instanceof Error ? error.message : String(error)
      }, 
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Chat creation API endpoint' });
}
