"use server";

import { getPrisma } from "@/lib/prisma";
import {
  getMainCodingPrompt,
  screenshotToCodePrompt,
  softwareArchitectPrompt,
} from "@/lib/prompts";
import { notFound } from "next/navigation";
import Together from "together-ai";
import { unifiedWebAI } from "@/lib/unified-web-ai";
// Use dynamic import for server-only API handlers
import type { ProviderSettings } from "@/lib/api/providers/types";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function createChat(
  prompt: string,
  model: string,
  quality: "high" | "low",
  screenshotUrl: string | undefined,
) {
  // Get the current session to associate chat with user
  const session = await getServerSession(authOptions);
  
  const prisma = getPrisma();
  const chat = await prisma.chat.create({
    data: {
      model,
      quality,
      prompt,
      title: "",
      shadcn: true,
      userId: session?.user?.id || null, // Associate with authenticated user
    },
  });

  let options: ConstructorParameters<typeof Together>[0] = {};
  if (process.env.HELICONE_API_KEY) {
    options.baseURL = "https://together.helicone.ai/v1";
    options.defaultHeaders = {
      "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      "Helicone-Property-appname": "LlamaCoder",
      "Helicone-Session-Id": chat.id,
      "Helicone-Session-Name": "LlamaCoder Chat",
    };
  }

  const together = new Together(options);

  // Use extension's API folder for better provider support
  async function callExtensionAPI(
    messages: any[],
    provider: string = 'openrouter',
    model?: string
  ) {
    try {
      const providerSettings: ProviderSettings = {
        apiProvider: provider
      };

      // Add provider-specific settings
      switch (provider) {
        case 'openrouter':
          providerSettings.openRouterApiKey = process.env.OPENROUTER_API_KEY;
          providerSettings.openRouterModelId = model || 'anthropic/claude-3.5-sonnet';
          break;
        case 'anthropic':
          providerSettings.apiKey = process.env.ANTHROPIC_API_KEY;
          providerSettings.apiModelId = model || 'claude-3-5-sonnet-20241022';
          break;
        case 'gemini':
          providerSettings.geminiApiKey = process.env.GOOGLE_API_KEY;
          providerSettings.geminiModelId = model || 'gemini-2.0-flash-exp';
          break;
        default:
          // Fallback to Together for unsupported providers
          throw new Error(`Provider ${provider} not configured`);
      }

      const { buildApiHandler } = await import("@/lib/api");
      const handler = buildApiHandler(providerSettings);
      
      // Convert messages format
      const systemPrompt = "You are a helpful assistant that generates real, working code.";
      const userMessages = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      let fullContent = '';
      const stream = handler.createMessage(systemPrompt, userMessages, {
        taskId: `web-${Date.now()}`,
        mode: 'web-generation'
      });

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullContent += chunk.text;
        }
      }

      return fullContent;
    } catch (error) {
      console.error(`Extension API call failed for ${provider}:`, error);
      throw error;
    }
  }

  async function fetchTitle() {
    const responseForChatTitle = await together.chat.completions.create({
      model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a chatbot helping the user create a simple app or script, and your current job is to create a succinct title, maximum 3-5 words, for the chat given their initial prompt. Please return only the title.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });
    const title = responseForChatTitle.choices[0].message?.content || prompt;
    return title;
  }

  async function fetchTopExample() {
    const findSimilarExamples = await together.chat.completions.create({
      model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      messages: [
        {
          role: "system",
          content: `You are a helpful bot. Given a request for building an app, you match it to the most similar example provided. If the request is NOT similar to any of the provided examples, return "none". Here is the list of examples, ONLY reply with one of them OR "none":

          - landing page
          - blog app
          - quiz app
          - pomodoro timer
          `,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const mostSimilarExample =
      findSimilarExamples.choices[0].message?.content || "none";
    return mostSimilarExample;
  }

  const [title, mostSimilarExample] = await Promise.all([
    fetchTitle(),
    fetchTopExample(),
  ]);

  let fullScreenshotDescription;
  if (screenshotUrl) {
    const screenshotResponse = await together.chat.completions.create({
      model: "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
      temperature: 0.2,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: screenshotToCodePrompt },
            {
              type: "image_url",
              image_url: {
                url: screenshotUrl,
              },
            },
          ],
        },
      ],
    });

    fullScreenshotDescription = screenshotResponse.choices[0].message?.content;
  }

  let userMessage: string;
  if (quality === "high") {
    let initialRes = await together.chat.completions.create({
      model: "Qwen/Qwen2.5-Coder-32B-Instruct",
      messages: [
        {
          role: "system",
          content: softwareArchitectPrompt,
        },
        {
          role: "user",
          content: fullScreenshotDescription
            ? fullScreenshotDescription + prompt
            : prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 3000,
    });

    userMessage = initialRes.choices[0].message?.content ?? prompt;
  } else if (fullScreenshotDescription) {
    userMessage =
      prompt +
      "RECREATE THIS APP AS CLOSELY AS POSSIBLE: " +
      fullScreenshotDescription;
  } else {
    userMessage = prompt;
  }

  let newChat = await prisma.chat.update({
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
            },
            { role: "user", content: userMessage, position: 1 },
          ],
        },
      },
    },
    include: {
      messages: true,
    },
  });

  const lastMessage = newChat.messages
    .sort((a, b) => a.position - b.position)
    .at(-1);
  if (!lastMessage) throw new Error("No new message");

  return {
    chatId: chat.id,
    lastMessageId: lastMessage.id,
  };
}

export async function createMessage(
  chatId: string,
  text: string,
  role: "assistant" | "user",
) {
  // Get the current session to verify chat ownership
  const session = await getServerSession(authOptions);
  
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { messages: true },
  });
  if (!chat) notFound();
  
  // Verify that the user owns this chat (or it's anonymous)
  if (chat.userId && chat.userId !== session?.user?.id) {
    throw new Error("Unauthorized: You can only access your own chats");
  }

  const maxPosition = Math.max(...chat.messages.map((m) => m.position));

  const newMessage = await prisma.message.create({
    data: {
      role,
      content: text,
      position: maxPosition + 1,
      chatId,
    },
  });

  return newMessage;
}

export async function getUserChats(limit: number = 10) {
  // Get the current session
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return [];
  }
  
  const prisma = getPrisma();
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
  const session = await getServerSession(authOptions);
  
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
  
  // Get basic chat counts
  const totalChats = await prisma.chat.count({
    where: { userId: session.user.id }
  });
  
  // Get today's chats
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
  
  // Get favorite model (most used)
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
  
  const favoriteModel = modelStats[0]?.model || "claude-3-5-sonnet-20241022";
  
  return {
    generationsToday: todaysChats,
    generationsTotal: totalChats,
    tokensUsed: totalChats * 2500, // Rough estimate
    favoriteModel,
    averageQuality: "high",
    deploymentsCount: Math.floor(totalChats * 0.3), // Rough estimate
    chatsCount: totalChats,
  };
}
