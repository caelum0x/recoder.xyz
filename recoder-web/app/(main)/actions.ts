"use server";

import { getPrisma, inMemoryStore } from "@/lib/prisma";
import {
  getMainCodingPrompt,
  screenshotToCodePrompt,
  softwareArchitectPrompt,
} from "@/lib/prompts";
import { notFound } from "next/navigation";
import Together from "together-ai";
import { unifiedWebAI } from "@/lib/unified-web-ai";
// Use dynamic import for server-only API handlers
import { requireAuth } from "@/lib/auth/server-auth";
import { callExtensionAPI } from "@/lib/server-api";

// Production Engine integration for advanced code generation
const PRODUCTION_ENGINE_URL = process.env.PRODUCTION_ENGINE_URL || 'https://recoder-production-engine.netlify.app';

// Helper to generate unique IDs
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function createChat(
  prompt: string,
  model: string,
  quality: "high" | "low",
  screenshotUrl: string | undefined,
) {
  try {
    console.log('Creating chat with:', { prompt: prompt.substring(0, 50), model, quality });

    // Get the current session to associate chat with user
    const session = await requireAuth().catch(() => null);
    console.log('Session:', session ? 'authenticated' : 'anonymous');

    // Use standardized Prisma client configuration
    const prisma = getPrisma();

    // Create chat (with fallback to in-memory storage)
    let chat: any;
    const chatId = generateId();

    // Try database first, fallback to in-memory on any error
    if (prisma) {
      try {
        console.log('Attempting database storage...');
        chat = await prisma.chat.create({
          data: {
            model,
            prompt,
            title: "",
            userId: session?.user?.id || "anonymous",
          },
        });
        console.log('✅ Database storage successful');
      } catch (dbError) {
        console.warn('⚠️  Database failed, using in-memory:', dbError instanceof Error ? dbError.message : 'Unknown error');
        // Fallback to in-memory
        chat = {
          id: chatId,
          model,
          prompt,
          title: "",
          userId: session?.user?.id || "anonymous",
          createdAt: new Date(),
          messages: [],
        };
        inMemoryStore.chats.set(chatId, chat);
      }
    } else {
      console.log('Using in-memory storage (no DB client)');
      chat = {
        id: chatId,
        model,
        prompt,
        title: "",
        userId: session?.user?.id || "anonymous",
        createdAt: new Date(),
        messages: [],
      };
      inMemoryStore.chats.set(chatId, chat);
    }

    console.log('Chat created successfully:', chat.id);

    // Check for any available API key - use any provider available
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    // Simple title generation - just use first few words of prompt
  async function fetchTitle() {
    try {
      // If we have Groq, use it (fastest for simple tasks)
      if (groqKey) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: 'Create a succinct title (3-5 words) for this request. Return only the title.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 20,
            temperature: 0.3,
          })
        });

        if (response.ok) {
          const data = await response.json();
          return data.choices[0]?.message?.content?.trim() || prompt.substring(0, 50);
        }
      }
    } catch (error) {
      console.warn('Title generation failed, using prompt:', error);
    }

    // Fallback: use first few words of prompt as title
    const words = prompt.split(' ').slice(0, 5).join(' ');
    return words.length > 50 ? words.substring(0, 47) + '...' : words;
  }

  async function fetchTopExample() {
    // Simple keyword matching instead of AI call
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('landing') || lowerPrompt.includes('page')) return 'landing page';
    if (lowerPrompt.includes('blog')) return 'blog app';
    if (lowerPrompt.includes('quiz') || lowerPrompt.includes('test')) return 'quiz app';
    if (lowerPrompt.includes('pomodoro') || lowerPrompt.includes('timer')) return 'pomodoro timer';

    return 'none';
  }

  const [title, mostSimilarExample] = await Promise.all([
    fetchTitle(),
    fetchTopExample(),
  ]);

  // Screenshot handling - skip for now (requires vision model)
  let fullScreenshotDescription;
  if (screenshotUrl) {
    fullScreenshotDescription = "Screenshot provided - image analysis not yet implemented";
  }

  // Use prompt directly as userMessage - AI enhancement happens in streaming endpoint
  let userMessage: string = prompt;

  // Enhanced code generation with production engine for complex prompts
  try {
    if (quality === "high" && (prompt.length > 100 || prompt.includes('production') || prompt.includes('deploy'))) {
      const productionResponse = await fetch(`${PRODUCTION_ENGINE_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: userMessage,
          model: model,
          enhance: true,
          production_ready: true
        })
      });

      if (productionResponse.ok) {
        const productionResult = await productionResponse.json();
        if (productionResult.enhanced_prompt) {
          userMessage = productionResult.enhanced_prompt;
        }
      }
    }
  } catch (error) {
    console.warn('Production engine enhancement failed, using standard generation:', error);
  }

  let newChat: any;
  let lastMessage: any;

  // Prepare in-memory message objects (used as fallback)
  const systemMessage = {
    id: generateId(),
    role: "system",
    content: getMainCodingPrompt(mostSimilarExample),
    position: 0,
    userId: session?.user?.id || "",
    chatId: chat.id,
    createdAt: new Date(),
    metadata: {},
  };

  const userMessageObj = {
    id: generateId(),
    role: "user",
    content: userMessage,
    position: 1,
    userId: session?.user?.id || "",
    chatId: chat.id,
    createdAt: new Date(),
    metadata: {},
  };

  if (prisma) {
    try {
      // Try database storage
      newChat = await prisma.chat.update({
        where: {
          id: chat.id,
        },
        data: {
          title,
          messages: {
            createMany: {
              data: [
                {
                  role: "system",
                  content: getMainCodingPrompt(mostSimilarExample),
                  position: 0,
                  userId: session?.user?.id || "",
                },
                {
                  role: "user",
                  content: userMessage,
                  position: 1,
                  userId: session?.user?.id || "",
                },
              ],
            },
          },
        },
        include: {
          messages: true,
        },
      });

      lastMessage = newChat.messages
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .at(-1);
    } catch (dbError) {
      console.warn('⚠️  Database update failed, using in-memory:', dbError instanceof Error ? dbError.message : 'Unknown');
      // Fallback to in-memory
      chat.title = title;
      chat.messages = [systemMessage, userMessageObj];
      inMemoryStore.chats.set(chat.id, chat);
      inMemoryStore.messages.set(systemMessage.id, systemMessage);
      inMemoryStore.messages.set(userMessageObj.id, userMessageObj);

      newChat = chat;
      lastMessage = userMessageObj;
    }
  } else {
    // In-memory storage
    chat.title = title;
    chat.messages = [systemMessage, userMessageObj];
    inMemoryStore.chats.set(chat.id, chat);
    inMemoryStore.messages.set(systemMessage.id, systemMessage);
    inMemoryStore.messages.set(userMessageObj.id, userMessageObj);

    newChat = chat;
    lastMessage = userMessageObj;
  }

  if (!lastMessage) throw new Error("No new message");

  return {
    chatId: chat.id,
    lastMessageId: lastMessage.id,
  };
  
  } catch (error) {
    console.error('Error in createChat:', error);
    throw new Error(`Failed to create chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function createMessage(
  chatId: string,
  text: string,
  role: "assistant" | "user",
) {
  // Get the current session to verify chat ownership
  const session = await requireAuth().catch(() => null);

  const prisma = getPrisma();

  if (!prisma) {
    // In-memory storage
    const chat = inMemoryStore.chats.get(chatId);
    if (!chat) notFound();

    const maxPosition = Math.max(...chat.messages.map((m: any) => m.position ?? 0), -1);

    const newMessage = {
      id: generateId(),
      role,
      content: text,
      position: maxPosition + 1,
      chatId,
      userId: session?.user?.id || "",
      createdAt: new Date(),
      metadata: {},
    };

    chat.messages.push(newMessage);
    inMemoryStore.messages.set(newMessage.id, newMessage);

    return newMessage;
  }

  // Database storage
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { messages: true },
  });
  if (!chat) notFound();

  // Verify that the user owns this chat (or it's anonymous)
  if (chat.userId && chat.userId !== session?.user?.id) {
    throw new Error("Unauthorized: You can only access your own chats");
  }

  const maxPosition = Math.max(...chat.messages.map((m) => m.position ?? 0), -1);

  const newMessage = await prisma.message.create({
    data: {
      role,
      content: text,
      position: maxPosition + 1,
      chatId,
      userId: session?.user?.id || "",
    },
  });

  return newMessage;
}

export async function getUserChats(limit: number = 10) {
  // Get the current session
  const session = await requireAuth().catch(() => null);

  if (!session?.user?.id) {
    return [];
  }

  const prisma = getPrisma();

  if (!prisma) {
    // In-memory storage
    const userChats = Array.from(inMemoryStore.chats.values())
      .filter((chat: any) => chat.userId === session.user.id)
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    return userChats;
  }

  // Database storage
  const chats = await prisma.chat.findMany({
    where: {
      userId: session.user.id,
    },
    include: {
      messages: {
        take: 1,
        orderBy: {
          position: 'desc'
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: limit
  });

  return chats;
}

export async function getUserStats() {
  // Get the current session
  const session = await requireAuth().catch(() => null);

  if (!session?.user?.id) {
    return {
      generationsToday: 0,
      generationsTotal: 0,
      tokensUsed: 0,
      favoriteModel: "claude-3-5-sonnet-20241022",
      averageQuality: "high",
      deploymentsCount: 0,
      chatsCount: 0,
    };
  }

  const prisma = getPrisma();

  if (!prisma) {
    // In-memory storage
    const userChats = Array.from(inMemoryStore.chats.values())
      .filter((chat: any) => chat.userId === session.user.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysChats = userChats.filter((chat: any) => chat.createdAt >= today);

    const modelCounts = new Map<string, number>();
    userChats.forEach((chat: any) => {
      modelCounts.set(chat.model, (modelCounts.get(chat.model) || 0) + 1);
    });

    let favoriteModel = "deepseek-ai/DeepSeek-V3";
    let maxCount = 0;
    modelCounts.forEach((count, model) => {
      if (count > maxCount) {
        maxCount = count;
        favoriteModel = model;
      }
    });

    return {
      generationsToday: todaysChats.length,
      generationsTotal: userChats.length,
      tokensUsed: userChats.length * 2500,
      favoriteModel,
      averageQuality: "high",
      deploymentsCount: Math.floor(userChats.length * 0.3),
      chatsCount: userChats.length,
    };
  }

  // Database storage
  const totalChats = await prisma.chat.count({
    where: { userId: session.user.id }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysChats = await prisma.chat.count({
    where: {
      userId: session.user.id,
      createdAt: {
        gte: today
      }
    }
  });

  const modelStats = await prisma.chat.groupBy({
    by: ['model'],
    where: { userId: session.user.id },
    _count: {
      model: true
    },
    orderBy: {
      _count: {
        model: 'desc'
      }
    },
    take: 1
  });

  const favoriteModel = modelStats[0]?.model || "deepseek-ai/DeepSeek-V3";

  return {
    generationsToday: todaysChats,
    generationsTotal: totalChats,
    tokensUsed: totalChats * 2500,
    favoriteModel,
    averageQuality: "high",
    deploymentsCount: Math.floor(totalChats * 0.3),
    chatsCount: totalChats,
  };
}
