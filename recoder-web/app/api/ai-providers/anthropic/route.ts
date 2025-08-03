import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Dynamic import to avoid client-side bundling
    const { AnthropicHandler } = await import('@/lib/api/providers/anthropic');
    
    const body = await request.json();
    const { settings, messages, systemPrompt } = body;
    
    const handler = new AnthropicHandler(settings);
    
    const response = handler.createMessage(systemPrompt, messages);
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk) + '\n'));
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Anthropic API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}