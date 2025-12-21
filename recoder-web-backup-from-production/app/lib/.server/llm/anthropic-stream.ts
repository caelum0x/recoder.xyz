/**
 * Direct Anthropic Streaming
 * Uses Anthropic's Messages API with streaming
 */

export interface StreamOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export async function streamAnthropicResponse(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  options: StreamOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const model = options.model || 'claude-3-5-sonnet-20241022';


  // Anthropic API requires alternating user/assistant messages
  // Filter out system messages from the messages array
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt, // System prompt goes here, not in messages
      messages: anthropicMessages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 8000,
    }),
  });

  console.log('📡 [Anthropic] Response received:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ [Anthropic] Error response:', errorText);
    throw new Error(`Anthropic error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    console.error('❌ [Anthropic] No response body');
    throw new Error('No response body');
  }


  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      let buffer = '';
      let chunkCount = 0;


      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
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
                continue;
              }

              try {
                const parsed = JSON.parse(data);

                // Anthropic streams different event types
                if (parsed.type === 'content_block_delta') {
                  // Extract text delta
                  const delta = parsed.delta;
                  if (delta?.type === 'text_delta' && delta.text) {
                    chunkCount++;
                    controller.enqueue(textEncoder.encode(delta.text));
                  }
                } else if (parsed.type === 'message_stop') {
                }
              } catch (e) {
                console.error('❌ [Anthropic] Failed to parse SSE data:', e);
              }
            }
          }
        }

        controller.close();
      } catch (error) {
        console.error('❌ [Anthropic] Stream processing error:', error);
        controller.error(error);
      }
    },
  });
}
