import { streamText } from 'ai';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { ChatSDKError } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { id, messages } = json;

    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    // Get or create chat
    let chat = await getChatById({ id });
    if (!chat) {
      await saveChat({
        id,
        userId: session.user.id,
        title: 'New Chat',
        visibility: 'private',
      });
    }

    // Use OpenRouter with DeepSeek free model
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseURL: 'https://openrouter.ai/api/v1',
    });

    const result = await streamText({
      model: openrouter('deepseek/deepseek-chat-v3.1:free'),
      messages,
      async onFinish({ text }) {
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
    console.error('Chat error:', error);
    return new Response('Error', { status: 500 });
  }
}
