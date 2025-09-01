import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-auth';

interface SmartSuggestionRequest {
  code: string;
  contextCode?: string;
  filePath: string;
  language: string;
  cursorPosition: { line: number; column: number };
  customPrompt?: string;
  analysisType: 'auto' | 'custom' | 'refactor' | 'debug';
}

interface AISuggestion {
  id: string;
  type: 'completion' | 'refactor' | 'fix' | 'optimize' | 'explain' | 'generate';
  title: string;
  description: string;
  code: string;
  confidence: number;
  reasoning: string;
  impact: 'low' | 'medium' | 'high';
  category: string;
}

async function generateSuggestions(request: SmartSuggestionRequest): Promise<AISuggestion[]> {
  try {
    // Prepare the AI prompt based on analysis type
    let systemPrompt = '';
    let userPrompt = '';

    switch (request.analysisType) {
      case 'auto':
        systemPrompt = `You are an expert code assistant. Analyze the provided code and generate helpful suggestions for improvement, completion, or optimization. Return a JSON array of suggestions with the following format:
        {
          "id": "unique_id",
          "type": "completion|refactor|fix|optimize|explain|generate",
          "title": "Brief suggestion title",
          "description": "Detailed description of what this suggestion does",
          "code": "The actual code to insert or replace",
          "confidence": 0.0-1.0,
          "reasoning": "Why this suggestion is helpful",
          "impact": "low|medium|high",
          "category": "Category like 'Performance', 'Security', 'Best Practices', etc."
        }`;
        
        userPrompt = `File: ${request.filePath}
Language: ${request.language}
Cursor Position: Line ${request.cursorPosition.line + 1}, Column ${request.cursorPosition.column + 1}

Current code context:
\`\`\`${request.language}
${request.contextCode || request.code}
\`\`\`

Analyze this code and provide intelligent suggestions for:
1. Code completion (if there's incomplete code)
2. Performance optimizations
3. Security improvements
4. Best practice recommendations
5. Bug fixes or potential issues
6. Type safety improvements (if TypeScript/JavaScript)

Focus on practical, actionable suggestions that would genuinely improve the code quality.`;
        break;

      case 'custom':
        systemPrompt = `You are an expert code assistant. The user has a specific request for their code. Provide helpful suggestions based on their request. Return a JSON array of suggestions with the same format as specified.`;
        
        userPrompt = `File: ${request.filePath}
Language: ${request.language}
User Request: "${request.customPrompt}"

Current code:
\`\`\`${request.language}
${request.code}
\`\`\`

Provide suggestions that directly address the user's request. Be specific and practical.`;
        break;

      case 'refactor':
        systemPrompt = `You are an expert code refactoring assistant. Analyze the code and suggest refactoring improvements that enhance readability, maintainability, and performance.`;
        
        userPrompt = `File: ${request.filePath}
Language: ${request.language}

Code to refactor:
\`\`\`${request.language}
${request.contextCode || request.code}
\`\`\`

Suggest refactoring improvements focusing on:
1. Code structure and organization
2. Reducing complexity
3. Improving readability
4. Eliminating code duplication
5. Better naming conventions
6. Design pattern applications`;
        break;

      case 'debug':
        systemPrompt = `You are an expert debugging assistant. Analyze the code for potential bugs, errors, or issues and provide fixes.`;
        
        userPrompt = `File: ${request.filePath}
Language: ${request.language}

Code to debug:
\`\`\`${request.language}
${request.contextCode || request.code}
\`\`\`

Look for:
1. Potential runtime errors
2. Logic bugs
3. Type errors
4. Performance issues
5. Memory leaks
6. Security vulnerabilities
7. Edge cases not handled`;
        break;
    }

    // Call OpenRouter API for suggestions
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz',
        'X-Title': 'Recoder.xyz Smart Code Assistant'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet', // Use Claude for better code analysis
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3, // Lower temperature for more focused suggestions
        max_tokens: 4000
      })
    });

    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter API error: ${openRouterResponse.statusText}`);
    }

    const openRouterData = await openRouterResponse.json();
    const aiResponse = openRouterData.choices?.[0]?.message?.content || '';

    // Parse the AI response
    let suggestions: AISuggestion[] = [];
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: create a single suggestion from the response
        suggestions = [{
          id: `suggestion_${Date.now()}`,
          type: 'explain',
          title: 'AI Analysis',
          description: 'Comprehensive code analysis and suggestions',
          code: aiResponse,
          confidence: 0.8,
          reasoning: 'Generated from AI analysis of the provided code',
          impact: 'medium',
          category: 'Analysis'
        }];
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      
      // Create a fallback suggestion
      suggestions = [{
        id: `fallback_${Date.now()}`,
        type: 'explain',
        title: 'Code Analysis',
        description: 'AI-generated insights about your code',
        code: aiResponse,
        confidence: 0.7,
        reasoning: 'Fallback suggestion when JSON parsing fails',
        impact: 'low',
        category: 'General'
      }];
    }

    // Ensure all suggestions have unique IDs and valid data
    return suggestions.map((suggestion, index) => ({
      ...suggestion,
      id: suggestion.id || `suggestion_${Date.now()}_${index}`,
      confidence: Math.min(Math.max(suggestion.confidence || 0.5, 0), 1),
      impact: suggestion.impact || 'medium',
      category: suggestion.category || 'General'
    }));

  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: SmartSuggestionRequest = await request.json();

    // Validate request
    if (!body.code || !body.filePath || !body.language) {
      return NextResponse.json(
        { error: 'Missing required fields: code, filePath, language' },
        { status: 400 }
      );
    }

    // Rate limiting check (simple implementation)
    const userId = session.user.id;
    const rateLimitKey = `ai_suggestions_${userId}`;
    
    // TODO: Implement proper rate limiting with Redis
    // For now, we'll allow all requests

    // Generate AI suggestions
    const suggestions = await generateSuggestions(body);

    // Log analytics
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analytics/ai-usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          action: 'smart_suggestions_generated',
          analysisType: body.analysisType,
          language: body.language,
          suggestionCount: suggestions.length,
          timestamp: new Date().toISOString()
        })
      });
    } catch (analyticsError) {
      console.error('Failed to log analytics:', analyticsError);
    }

    return NextResponse.json({
      suggestions,
      meta: {
        analysisType: body.analysisType,
        language: body.language,
        suggestionCount: suggestions.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Smart suggestions API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions' },
      { status: 500 }
    );
  }
}
