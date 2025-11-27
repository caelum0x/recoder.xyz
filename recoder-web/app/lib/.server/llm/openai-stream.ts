/**
 * Direct OpenAI Streaming
 * Uses OpenAI's Chat Completions API with streaming
 */

export interface StreamOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export async function streamOpenAIResponse(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  options: StreamOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const model = options.model || 'gpt-4-turbo-preview';

  console.log('🚀 [OpenAI] Starting request to OpenAI API');
  console.log('📝 [OpenAI] Model:', model);
  console.log('📊 [OpenAI] Messages count:', messages.length);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
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

  console.log('📡 [OpenAI] Response received:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ [OpenAI] Error response:', errorText);
    throw new Error(`OpenAI error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    console.error('❌ [OpenAI] No response body');
    throw new Error('No response body');
  }

  console.log('✅ [OpenAI] Starting stream processing');

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      let buffer = '';
      let chunkCount = 0;

      console.log('🔄 [OpenAI] Stream reader started');

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('✅ [OpenAI] Stream complete. Total chunks:', chunkCount);
            break;
          }

          buffer += textDecoder.decode(value, { stream: true });

          // Process complete SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim() || line.startsWith(':')) continue;

            if (line.startsWith('data: ')) {
              const data = line.slice(6); // Remove 'data: ' prefix

              if (data === '[DONE]') {
                console.log('✅ [OpenAI] Received [DONE] signal');
                continue;
              }

              try {
                const parsed = JSON.parse(data);

                // Extract content delta
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  chunkCount++;
                  controller.enqueue(textEncoder.encode(delta.content));
                }
              } catch (e) {
                console.error('❌ [OpenAI] Failed to parse SSE data:', e);
              }
            }
          }
        }

        controller.close();
        console.log('✅ [OpenAI] Controller closed');
      } catch (error) {
        console.error('❌ [OpenAI] Stream processing error:', error);
        controller.error(error);
      }
    },
  });
}
