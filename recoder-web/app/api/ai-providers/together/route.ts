import { NextRequest, NextResponse } from 'next/server';
import Together from 'together-ai';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, model, messages, temperature = 0.7 } = body;
    
    const together = new Together({
      apiKey: apiKey || process.env.TOGETHER_API_KEY,
    });
    
    const stream = together.chat.completions.create({
      model,
      messages,
      temperature,
      stream: true,
    });
    
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream as any) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              controller.enqueue(new TextEncoder().encode(JSON.stringify({
                type: 'text',
                text: content
              }) + '\n'));
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });
    
    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Together API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}