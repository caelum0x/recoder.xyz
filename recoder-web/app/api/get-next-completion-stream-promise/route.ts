import { z } from "zod";
import Together from "together-ai";
import Anthropic from '@anthropic-ai/sdk';
import { advancedCache } from "@/lib/advanced-caching-system";
import { getPrisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const prisma = getPrisma();
  const { messageId, model } = await req.json();

  console.log(`🚀 Generation request - Model: ${model}, MessageId: ${messageId}`); 

  const message = await prisma.message.findUnique({
    where: { id: messageId },
  });

  if (!message) {
    return new Response(null, { status: 404 });
  }

  const messagesRes = await prisma.message.findMany({
    where: { chatId: message.chatId, position: { lte: message.position } },
    orderBy: { position: "asc" },
  });

  let messages = z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .parse(messagesRes);

  if (messages.length > 10) {
    messages = [messages[0], messages[1], messages[2], ...messages.slice(-7)];
  }

  // 🚀 CURSOR KILLER: Check cache for instant responses
  const userPrompt = messages.find(m => m.role === 'user')?.content || '';
  const quality = userPrompt.length > 100 ? 'high' : 'low'; // Determine quality from prompt
  
  const cachedResponse = await advancedCache.get(userPrompt, model, quality);
  if (cachedResponse) {
    console.log(`⚡ INSTANT CACHE HIT - Delivering result in < 1 second!`);
    
    // Return cached response as a stream to maintain API compatibility
    const stream = new ReadableStream({
      start(controller) {
        // Simulate streaming for smooth UI experience
        const words = cachedResponse.split(' ');
        let index = 0;
        
        const interval = setInterval(() => {
          if (index < words.length) {
            const chunk = words.slice(index, index + 5).join(' ') + ' ';
            const data = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            index += 5;
          } else {
            controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
            controller.close();
            clearInterval(interval);
          }
        }, 50); // Fast streaming for cached content
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Cache-Status': 'HIT', // Indicate cache hit
      },
    });
  }

  let options: ConstructorParameters<typeof Together>[0] = {
    apiKey: process.env.TOGETHER_API_KEY,
  };
  
  if (process.env.HELICONE_API_KEY) {
    options.baseURL = "https://together.helicone.ai/v1";
    options.defaultHeaders = {
      "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      "Helicone-Property-appname": "LlamaCoder",
      "Helicone-Session-Id": message.chatId,
      "Helicone-Session-Name": "LlamaCoder Chat",
    };
  }

  // Route to appropriate AI provider based on model
  if (model.includes('claude')) {
    // Use Anthropic Claude
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response("Claude API key not configured", { status: 500 });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: model,
      max_tokens: 9000,
      temperature: 0.2,
      messages: messages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role as 'user' | 'assistant',
        content: m.role === 'system' ? `System: ${m.content}` : m.content
      })),
      stream: true,
    });

    // Convert Anthropic stream to readable stream with caching
    let fullResponse = '';
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              const content = chunk.delta.text;
              fullResponse += content;
              const data = JSON.stringify({ choices: [{ delta: { content } }] });
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            }
          }
          
          // 💾 Cache the complete response for future speed
          if (fullResponse.trim().length > 50) {
            await advancedCache.set(userPrompt, model, quality, fullResponse);
            console.log(`💾 Cached Claude response for future 3x speed boost`);
          }
          
          controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
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
        'Connection': 'keep-alive',
        'X-Cache-Status': 'MISS', // Indicate cache miss
      },
    });
  } else {
    // Use Together AI for other models with enhanced caching
    const together = new Together(options);

    const res = await together.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      temperature: 0.2,
      max_tokens: 9000,
    });

    // Wrap Together AI stream with caching capability
    let fullResponse = '';
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const decoder = new TextDecoder();
        const text = decoder.decode(chunk);
        
        // Extract content from SSE format
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                }
              } catch (e) {
                // Ignore parsing errors
              }
            } else {
              // Stream is done, cache the response
              if (fullResponse.trim().length > 50) {
                advancedCache.set(userPrompt, model, quality, fullResponse).then(() => {
                  console.log(`💾 Cached Together AI response (${model}) for future speed`);
                }).catch(err => {
                  console.warn('Cache save failed:', err);
                });
              }
            }
          }
        }
        
        controller.enqueue(chunk);
      }
    });

    const cachedStream = res.toReadableStream().pipeThrough(transformStream);
    
    return new Response(cachedStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Cache-Status': 'MISS',
      },
    });
  }
}

export const runtime = "edge";
export const maxDuration = 45;
