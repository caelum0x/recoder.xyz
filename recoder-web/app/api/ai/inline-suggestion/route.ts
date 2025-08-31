import { NextRequest, NextResponse } from 'next/server';

interface InlineSuggestionRequest {
  code: string;
  position: {
    line: number;
    column: number;
  };
  fileName: string;
  context: {
    language: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: InlineSuggestionRequest = await request.json();
    const { code, position, fileName, context } = body;

    // Get current line and surrounding context
    const lines = code.split('\n');
    const currentLine = lines[position.line - 1] || '';
    const previousLines = lines.slice(Math.max(0, position.line - 3), position.line - 1);
    const nextLines = lines.slice(position.line, position.line + 2);

    // Prepare AI prompt for inline suggestions
    const prompt = `You are an expert code completion assistant. Provide a short, accurate code suggestion for the cursor position.

File: ${fileName}
Language: ${context.language}

Previous lines:
${previousLines.map((line, i) => `${position.line - previousLines.length + i}: ${line}`).join('\n')}

Current line (cursor at column ${position.column}):
${position.line}: ${currentLine}

Next lines:
${nextLines.map((line, i) => `${position.line + 1 + i}: ${line}`).join('\n')}

Provide a single, relevant code completion suggestion for the cursor position. Keep it short and contextually appropriate. Only return the suggestion text, no explanations.`;

    // Call production engine for AI suggestion
    const engineResponse = await fetch(`${process.env.NEXT_PUBLIC_ENGINE_URL_DEV || 'http://localhost:8001'}/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        model: 'claude-3-haiku-20240307', // Fast model for inline suggestions
        maxTokens: 100,
        temperature: 0.3,
        stream: false
      }),
    });

    if (!engineResponse.ok) {
      throw new Error('Engine request failed');
    }

    const engineData = await engineResponse.json();
    
    if (engineData.success && engineData.data.response) {
      const suggestionText = engineData.data.response.trim();
      
      // Calculate confidence based on suggestion quality
      const confidence = calculateSuggestionConfidence(suggestionText, currentLine, context.language);
      
      return NextResponse.json({
        success: true,
        suggestion: {
          text: suggestionText,
          confidence,
          type: 'completion',
          metadata: {
            model: engineData.data.model,
            tokensUsed: engineData.data.usage?.totalTokens || 0
          }
        }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'No suggestion generated'
      });
    }

  } catch (error) {
    console.error('AI inline suggestion error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate AI suggestion'
    }, { status: 500 });
  }
}

// Calculate confidence score for suggestion quality
function calculateSuggestionConfidence(suggestion: string, currentLine: string, language: string): number {
  let confidence = 0.5; // Base confidence

  // Language-specific syntax checking
  if (language === 'typescript' || language === 'javascript') {
    if (suggestion.includes('function') || suggestion.includes('=>')) confidence += 0.2;
    if (suggestion.includes('const') || suggestion.includes('let')) confidence += 0.1;
    if (suggestion.includes('{') && suggestion.includes('}')) confidence += 0.1;
  }

  // Context relevance
  if (currentLine.includes('import') && suggestion.includes('from')) confidence += 0.2;
  if (currentLine.includes('function') && suggestion.includes('(')) confidence += 0.2;
  if (currentLine.includes('console') && suggestion.includes('log')) confidence += 0.3;

  // Suggestion quality
  if (suggestion.length > 5 && suggestion.length < 100) confidence += 0.1;
  if (suggestion.includes('\n')) confidence += 0.1; // Multi-line suggestions
  
  return Math.min(confidence, 0.95); // Cap at 95%
}
