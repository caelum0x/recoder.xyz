/**
 * 🚀 Bolt AI Streaming API - Claude Sonnet 4.5
 *
 * Streams AI responses with bolt.new artifact support
 */

import { createBoltStream, parseBoltArtifacts, type BoltMessage } from '@/lib/ai/bolt-ai-provider';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { messages, model = 'premium', maxTokens = 16000 } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    // Convert to BoltMessage format
    const boltMessages: BoltMessage[] = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // Create streaming response
    const stream = await createBoltStream(boltMessages, {
      model: model as 'premium' | 'fast' | 'free' | 'coding',
      maxTokens,
      temperature: 0.2,
    });

    // Check if it's an Anthropic stream
    if ('textStream' in stream) {
      // Anthropic stream
      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            let fullResponse = '';

            for await (const chunk of stream.textStream) {
              fullResponse += chunk;

              // Send chunk
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
              );
            }

            // Parse artifacts from complete response
            const { files, shellCommands } = parseBoltArtifacts(fullResponse);

            // Send artifacts
            if (files.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'artifacts', files, shellCommands })}\n\n`
                )
              );
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // OpenRouter stream (ReadableStream)
      const encoder = new TextEncoder();

      const transformedStream = new ReadableStream({
        async start(controller) {
          try {
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n').filter(line => line.trim());

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') continue;

                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0]?.delta?.content;

                    if (content) {
                      fullResponse += content;
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'text', content })}\n\n`)
                      );
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }

            // Parse artifacts from complete response
            const { files, shellCommands } = parseBoltArtifacts(fullResponse);

            // Send artifacts
            if (files.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'artifacts', files, shellCommands })}\n\n`
                )
              );
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          }
        },
      });

      return new Response(transformedStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
  } catch (error) {
    console.error('Bolt stream error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stream failed' },
      { status: 500 }
    );
  }
}
