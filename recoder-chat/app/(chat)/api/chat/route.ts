import { streamText } from 'ai';
import { auth } from '@/app/(auth)/auth';
import {
  getChatById,
  saveChat,
  saveMessages,
  deleteChatById,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { ChatSDKError } from '@/lib/errors';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { id, messages } = json;

    console.log('📨 Chat request:', { id, messageCount: messages?.length });

    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    // Validate messages array
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new ChatSDKError('bad_request:api').toResponse();
    }

    // Get or create chat
    let chat = await getChatById({ id });
    if (!chat) {
      const firstMessage = messages?.[0]?.content || 'New Chat';
      const title = typeof firstMessage === 'string'
        ? firstMessage.substring(0, 50)
        : 'New Chat';

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: 'private',
      });
    } else if (chat.userId !== session.user.id) {
      return new ChatSDKError('forbidden:chat').toResponse();
    }

    // Save user message
    const userMessage = messages[messages.length - 1];
    await saveMessages({
      messages: [
        {
          id: generateUUID(),
          chatId: id,
          role: 'user',
          parts: [{ type: 'text', text: userMessage.content }],
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    // Use OpenRouter with DeepSeek free model
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseURL: 'https://openrouter.ai/api/v1',
    });

    console.log('🤖 Streaming with DeepSeek...');

    const result = await streamText({
      model: openrouter('deepseek/deepseek-chat-v3.1:free'),
      messages,
      async onFinish({ text }) {
        console.log('💾 Saving response:', text.substring(0, 100));
        await saveMessages({
          messages: [
            {
              id: generateUUID(),
              chatId: id,
              role: 'assistant',
              parts: [{ type: 'text', text }],
              attachments: [],
              createdAt: new Date(),
            },
          ],
        });
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('❌ Chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
