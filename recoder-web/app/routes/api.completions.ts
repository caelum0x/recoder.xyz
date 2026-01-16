import { type ActionFunctionArgs } from '@remix-run/cloudflare';

// Provider priority order for completions (fast models preferred)
const PROVIDER_PRIORITY = ['groq', 'openrouter', 'openai', 'anthropic'] as const;

// Model mapping per provider for completions (fast, cheap models)
const COMPLETION_MODELS: Record<string, string> = {
  groq: 'llama-3.1-8b-instant',
  openrouter: 'anthropic/claude-3-haiku',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
};

// API base URLs per provider
const API_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
};

export async function action({ request }: ActionFunctionArgs) {
  const { verifySession } = await import('~/lib/auth/session.server');
  const { getUserApiKey, getSessionCookie } = await import('~/lib/.server/llm/user-api-key');
  
  const session = await verifySession(request);

  if (!session?.user) {
    return new Response(JSON.stringify({ completion: '', error: 'Not authenticated' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { prefix, suffix } = await request.json<{ prefix: string; suffix: string }>();

  if (!prefix || prefix.length < 10) {
    return new Response(JSON.stringify({ completion: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // BYOK: Try each provider in priority order until we find one with a key
  const sessionCookie = getSessionCookie(request);
  let apiKey: string | null = null;
  let provider: string | null = null;

  for (const p of PROVIDER_PRIORITY) {
    const key = await getUserApiKey(sessionCookie, p);
    if (key) {
      apiKey = key;
      provider = p;
      break;
    }
  }

  if (!apiKey || !provider) {
    return new Response(JSON.stringify({ 
      completion: '', 
      error: 'No API key configured. Add your API key in Settings.' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const model = COMPLETION_MODELS[provider];
  const prompt = `Complete the following code. Only output the completion, no explanation.

<code_before_cursor>
${prefix.slice(-2000)}
</code_before_cursor>

<code_after_cursor>
${suffix.slice(0, 500)}
</code_after_cursor>

Output only the code that should be inserted at the cursor position:`;

  try {
    let completion = '';

    if (provider === 'anthropic') {
      // Anthropic has different API format
      const response = await fetch(`${API_URLS.anthropic}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 150,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json() as any;
      completion = data.content?.[0]?.text?.trim() || '';
    } else {
      // OpenAI-compatible APIs (groq, openrouter, openai)
      const baseUrl = API_URLS[provider];
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://recoder.xyz';
        headers['X-Title'] = 'Recoder.xyz';
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0,
        }),
      });
      const data = await response.json() as any;
      completion = data.choices?.[0]?.message?.content?.trim() || '';
    }

    return new Response(JSON.stringify({ completion }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Completion error:', error);
    return new Response(JSON.stringify({ completion: '', error: 'API request failed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
