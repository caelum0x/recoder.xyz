import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-error-handler";

// Message schema
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string().optional(),
  model: z.string().optional()
});

// Request schema for chat
const chatRequestSchema = z.object({
  messages: z.array(messageSchema),
  model: z.string().optional(),
  conversationId: z.string().optional(),
  stream: z.boolean().default(true),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(32000).default(4096),
  topP: z.number().min(0).max(1).default(0.95)
});

// Conversation storage (in-memory for now, would use database in production)
const conversationStore = new Map<string, Array<z.infer<typeof messageSchema>>>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model, conversationId, stream, temperature, maxTokens, topP } = chatRequestSchema.parse(body);

    // Generate or use existing conversation ID
    const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store conversation history
    conversationStore.set(convId, messages);

    // Determine which AI provider to use
    const selectedModel = model || selectOptimalModel(messages);

    // Stream response if requested
    if (stream) {
      return handleStreamingChat(messages, selectedModel, convId, {
        temperature,
        maxTokens,
        topP
      });
    }

    // Non-streaming response
    const response = await generateChatResponse(messages, selectedModel, {
      temperature,
      maxTokens,
      topP
    });

    // Add assistant response to conversation history
    const assistantMessage: z.infer<typeof messageSchema> = {
      role: "assistant",
      content: response.content,
      timestamp: new Date().toISOString(),
      model: selectedModel
    };

    const updatedMessages = [...messages, assistantMessage];
    conversationStore.set(convId, updatedMessages);

    return new Response(JSON.stringify({
      success: true,
      conversationId: convId,
      message: assistantMessage,
      usage: response.usage,
      model: selectedModel
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return handleApiError(error);
  }
}

// Get conversation history
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (conversationId) {
      const conversation = conversationStore.get(conversationId);
      if (!conversation) {
        return new Response(JSON.stringify({
          error: "Conversation not found"
        }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        conversationId,
        messages: conversation,
        messageCount: conversation.length
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // List all conversations
    const conversations = Array.from(conversationStore.entries()).map(([id, messages]) => ({
      id,
      messageCount: messages.length,
      lastMessage: messages[messages.length - 1],
      createdAt: messages[0]?.timestamp || new Date().toISOString()
    }));

    return new Response(JSON.stringify({
      conversations,
      count: conversations.length
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return handleApiError(error);
  }
}

// Delete conversation
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return new Response(JSON.stringify({
        error: "Conversation ID required"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const deleted = conversationStore.delete(conversationId);

    return new Response(JSON.stringify({
      success: deleted,
      message: deleted ? "Conversation deleted" : "Conversation not found"
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return handleApiError(error);
  }
}

// Select optimal model based on conversation context
function selectOptimalModel(messages: Array<z.infer<typeof messageSchema>>): string {
  // Analyze conversation to select best model
  const lastUserMessage = messages.filter(m => m.role === "user").pop();
  if (!lastUserMessage) {
    return "zhipuai/glm-4.5-air:free"; // Default to free model
  }

  const content = lastUserMessage.content.toLowerCase();

  // Reasoning tasks -> FREE reasoning models
  if (content.includes("explain") || content.includes("analyze") || content.includes("reason")) {
    return "deepseek/deepseek-r1-0528:free";
  }

  // Code generation -> FREE code models
  if (content.includes("code") || content.includes("function") || content.includes("implement")) {
    return "qwen/qwen3-coder-480b-a35b:free";
  }

  // Image generation
  if (content.includes("image") || content.includes("picture") || content.includes("draw")) {
    return "gemini-2.5-flash-image";
  }

  // Fast responses -> TNG Chimera (fastest free model)
  if (content.includes("quick") || content.includes("fast")) {
    return "tngtech/deepseek-tng-r1t2-chimera:free";
  }

  // Default to GLM 4.5 Air (balanced free model)
  return "zhipuai/glm-4.5-air:free";
}

// Generate chat response
async function generateChatResponse(
  messages: Array<z.infer<typeof messageSchema>>,
  model: string,
  options: {
    temperature: number;
    maxTokens: number;
    topP: number;
  }
): Promise<{
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
}> {
  // Determine provider based on model
  const provider = getProviderFromModel(model);

  // Get API key for the provider
  const apiKey = getApiKey(provider);

  if (!apiKey) {
    throw new Error(`API key not configured for provider: ${provider}`);
  }

  // Call the appropriate API
  if (provider === "openrouter") {
    return await callOpenRouter(messages, model, apiKey, options);
  } else if (provider === "google" || provider === "gemini") {
    return await callGemini(messages, model, apiKey, options);
  } else if (provider === "anthropic") {
    return await callAnthropic(messages, model, apiKey, options);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// Handle streaming chat response
async function handleStreamingChat(
  messages: Array<z.infer<typeof messageSchema>>,
  model: string,
  conversationId: string,
  options: {
    temperature: number;
    maxTokens: number;
    topP: number;
  }
): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const provider = getProviderFromModel(model);
        const apiKey = getApiKey(provider);

        if (!apiKey) {
          throw new Error(`API key not configured for provider: ${provider}`);
        }

        let fullContent = "";

        // Stream from the provider
        if (provider === "openrouter") {
          await streamFromOpenRouter(messages, model, apiKey, options, (chunk) => {
            fullContent += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`));
          });
        } else if (provider === "google" || provider === "gemini") {
          await streamFromGemini(messages, model, apiKey, options, (chunk) => {
            fullContent += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`));
          });
        }

        // Save complete response to conversation history
        const assistantMessage: z.infer<typeof messageSchema> = {
          role: "assistant",
          content: fullContent,
          timestamp: new Date().toISOString(),
          model
        };

        const updatedMessages = [...messages, assistantMessage];
        conversationStore.set(conversationId, updatedMessages);

        // Send completion
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "", done: true, conversationId })}\n\n`));
        controller.close();

      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}

// Helper functions
function getProviderFromModel(model: string): string {
  if (model.includes("gemini")) return "google";
  if (model.includes("claude")) return "anthropic";
  if (model.includes("/")) return "openrouter"; // Free models use OpenRouter format
  return "openrouter";
}

function getApiKey(provider: string): string | undefined {
  const keys: Record<string, string | undefined> = {
    openrouter: process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY,
    google: process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    gemini: process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY
  };
  return keys[provider];
}

// OpenRouter API call
async function callOpenRouter(
  messages: Array<z.infer<typeof messageSchema>>,
  model: string,
  apiKey: string,
  options: { temperature: number; maxTokens: number; topP: number }
): Promise<{ content: string; usage: any }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://recoder.xyz",
      "X-Title": "Recoder Web"
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    usage: data.usage || { inputTokens: 0, outputTokens: 0, totalCost: 0 }
  };
}

// Gemini API call
async function callGemini(
  messages: Array<z.infer<typeof messageSchema>>,
  model: string,
  apiKey: string,
  options: { temperature: number; maxTokens: number; topP: number }
): Promise<{ content: string; usage: any }> {
  const contents = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          topP: options.topP
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.candidates[0].content.parts[0].text,
    usage: data.usageMetadata || { inputTokens: 0, outputTokens: 0, totalCost: 0 }
  };
}

// Anthropic API call
async function callAnthropic(
  messages: Array<z.infer<typeof messageSchema>>,
  model: string,
  apiKey: string,
  options: { temperature: number; maxTokens: number; topP: number }
): Promise<{ content: string; usage: any }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text,
    usage: data.usage || { inputTokens: 0, outputTokens: 0, totalCost: 0 }
  };
}

// Streaming helpers
async function streamFromOpenRouter(
  messages: Array<z.infer<typeof messageSchema>>,
  model: string,
  apiKey: string,
  options: { temperature: number; maxTokens: number; topP: number },
  onChunk: (chunk: string) => void
): Promise<void> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://recoder.xyz",
      "X-Title": "Recoder Web"
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`OpenRouter stream error: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter(line => line.trim().startsWith("data:"));

    for (const line of lines) {
      const data = line.replace("data: ", "");
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices[0]?.delta?.content;
        if (content) {
          onChunk(content);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
}

async function streamFromGemini(
  messages: Array<z.infer<typeof messageSchema>>,
  model: string,
  apiKey: string,
  options: { temperature: number; maxTokens: number; topP: number },
  onChunk: (chunk: string) => void
): Promise<void> {
  const contents = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          topP: options.topP
        }
      })
    }
  );

  if (!response.ok || !response.body) {
    throw new Error(`Gemini stream error: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    try {
      const parsed = JSON.parse(chunk);
      const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        onChunk(content);
      }
    } catch (e) {
      // Skip invalid JSON
    }
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
