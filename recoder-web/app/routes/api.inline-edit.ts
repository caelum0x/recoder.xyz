import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('InlineEdit');

const PROVIDER_PRIORITY = ['openrouter', 'anthropic', 'openai', 'groq'] as const;

const EDIT_MODELS: Record<string, string> = {
  openrouter: 'anthropic/claude-sonnet-4-20250514',
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  groq: 'llama-3.3-70b-versatile',
};

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
    return new Response(
      JSON.stringify({ replacement: '', error: 'Not authenticated' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { instruction, selectedCode, prefix, suffix } = await request.json<{
    instruction: string;
    selectedCode: string;
    prefix: string;
    suffix: string;
  }>();

  if (!instruction || !selectedCode) {
    return new Response(
      JSON.stringify({ replacement: selectedCode || '', error: 'Missing instruction or selected code' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Find provider with key
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
    return new Response(
      JSON.stringify({ replacement: selectedCode, error: 'No API key configured' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const model = EDIT_MODELS[provider];
  const prompt = `You are a code editor. The user has selected code and wants you to modify it.

<code_before_selection>
${prefix.slice(-1500)}
</code_before_selection>

<selected_code>
${selectedCode}
</selected_code>

<code_after_selection>
${suffix.slice(0, 500)}
</code_after_selection>

<instruction>
${instruction}
</instruction>

Output ONLY the replacement code that should replace the selected code. No explanations, no markdown fences, no surrounding code - just the replacement text. Preserve the same indentation style.`;

  try {
    let replacement = '';

    if (provider === 'anthropic') {
      const response = await fetch(`${API_URLS.anthropic}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = (await response.json()) as any;
      replacement = data.content?.[0]?.text || '';
    } else {
      const baseUrl = API_URLS[provider];
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
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
          max_tokens: 2048,
          temperature: 0,
        }),
      });
      const data = (await response.json()) as any;
      replacement = data.choices?.[0]?.message?.content || '';
    }

    // Clean up: strip markdown code fences if the model added them
    replacement = replacement
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '')
      .trimEnd();

    return new Response(
      JSON.stringify({ replacement }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    logger.error('Inline edit error:', error);

    return new Response(
      JSON.stringify({ replacement: selectedCode, error: 'API request failed' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
