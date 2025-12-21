import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';

const encoder = new TextEncoder();

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  // CRITICAL: Verify user authentication for AI features
  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);

  if (!session?.user) {
    // User not authenticated - return error
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'X-Error-Type': 'NOT_AUTHENTICATED',
      },
    });
  }

  const { message } = await request.json<{ message: string }>();

  try {
    const result = await streamText(
      [
        {
          role: 'user',
          content: stripIndents`
          I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

          IMPORTANT: Only respond with the improved prompt and nothing else!

          <original_prompt>
            ${message}
          </original_prompt>
        `,
        },
      ],
      (context as any)?.cloudflare?.env || process.env,
    );

    // Use textStream from native implementation
    return new Response(result.textStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.log(error);

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
