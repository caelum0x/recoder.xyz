/**
 * Direct OpenRouter Streaming - NO AI SDK
 * Simple fetch-based streaming that works with frontend
 */

export interface StreamOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export async function streamOpenRouterResponse(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  options: StreamOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const model = options.model || 'x-ai/grok-code-fast-1'; // Fast coding model

  console.log('🚀 [OpenRouter] Starting request to OpenRouter API');
  console.log('📝 [OpenRouter] Model:', model);
  console.log('📊 [OpenRouter] Messages count:', messages.length);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://recoder.xyz',
      'X-Title': 'Recoder.xyz',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 8000,
    }),
  });

  console.log('📡 [OpenRouter] Response received:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ [OpenRouter] Error response:', errorText);
    throw new Error(`OpenRouter error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    console.error('❌ [OpenRouter] No response body');
    throw new Error('No response body');
  }

  console.log('✅ [OpenRouter] Starting stream processing');

  // Transform SSE stream to plain text
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      let buffer = '';
      let chunkCount = 0;

      console.log('🔄 [OpenRouter] Stream reader started');

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('✅ [OpenRouter] Stream complete. Total chunks:', chunkCount);
            break;
          }

          buffer += textDecoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(trimmed.substring(6));

              // Check for API errors in the stream
              if (data.error) {
                console.error('❌ [OpenRouter] API error in stream:', data.error);
                controller.error(new Error(`OpenRouter API error: ${JSON.stringify(data.error)}`));
                return;
              }

              const content = data.choices[0]?.delta?.content;
              if (content) {
                chunkCount++;
                if (chunkCount === 1) {
                  console.log('📝 [OpenRouter] First chunk received');
                }
                controller.enqueue(textEncoder.encode(content));
              }
            } catch (e) {
              console.warn('⚠️ [OpenRouter] Failed to parse SSE line:', trimmed);
            }
          }
        }

        if (chunkCount === 0) {
          console.warn('⚠️ [OpenRouter] Stream completed but NO content chunks were received!');
          console.warn('   This could indicate an API error, invalid model, or authentication issue.');
        }

        controller.close();
        console.log('🏁 [OpenRouter] Stream closed successfully');
      } catch (error) {
        console.error('❌ [OpenRouter] Stream error:', error);
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    }
  });
}
