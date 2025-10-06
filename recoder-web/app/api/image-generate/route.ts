import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-error-handler";

// Request schema for image generation
const imageGenerationSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  model: z.string().default("gemini-2.5-flash-image"),
  negativePrompt: z.string().optional(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
  numImages: z.number().min(1).max(4).default(1),
  mode: z.enum(["generate", "edit"]).default("generate"),
  referenceImage: z.string().optional(), // Base64 encoded image for edits
});

// Response schema
interface ImageGenerationResult {
  success: boolean;
  images: Array<{
    url?: string;
    base64?: string;
    metadata: {
      prompt: string;
      model: string;
      aspectRatio: string;
      generatedAt: string;
    };
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  provider: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedData = imageGenerationSchema.parse(body);

    // Generate images using Gemini 2.5 Flash Image
    const result = await generateImages(validatedData);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return handleApiError(error);
  }
}

// Get available image generation models
export async function GET(req: NextRequest) {
  try {
    const models = [
      {
        id: "gemini-2.5-flash-image",
        name: "Gemini 2.5 Flash Image (Nano Banana)",
        provider: "google",
        description: "State-of-the-art image generation with contextual understanding",
        capabilities: ["generation", "editing", "multi-turn"],
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        maxImages: 4,
        pricing: {
          inputCostPer1M: 0.30,
          outputCostPer1M: 2.50,
          imageCostPer1K: 0.03
        }
      }
    ];

    return new Response(JSON.stringify({
      models,
      defaultModel: "gemini-2.5-flash-image",
      timestamp: new Date().toISOString()
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return handleApiError(error);
  }
}

// Generate images using the specified model
async function generateImages(data: z.infer<typeof imageGenerationSchema>): Promise<ImageGenerationResult> {
  const { prompt, model, negativePrompt, aspectRatio, numImages, mode, referenceImage } = data;

  // Check if Google API key is available
  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

  if (!googleApiKey) {
    throw new Error("Google API key not configured. Please add GOOGLE_API_KEY to your environment variables.");
  }

  try {
    // For Gemini 2.5 Flash Image
    if (model === "gemini-2.5-flash-image") {
      return await generateWithGemini(prompt, {
        apiKey: googleApiKey,
        negativePrompt,
        aspectRatio,
        numImages,
        mode,
        referenceImage
      });
    }

    throw new Error(`Unsupported model: ${model}`);

  } catch (error) {
    console.error("Image generation error:", error);
    throw new Error(`Failed to generate images: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Generate images using Gemini 2.5 Flash Image
async function generateWithGemini(
  prompt: string,
  options: {
    apiKey: string;
    negativePrompt?: string;
    aspectRatio: string;
    numImages: number;
    mode: string;
    referenceImage?: string;
  }
): Promise<ImageGenerationResult> {
  const { apiKey, negativePrompt, aspectRatio, numImages, mode, referenceImage } = options;

  // Construct the full prompt
  let fullPrompt = prompt;
  if (negativePrompt) {
    fullPrompt += `\n\nNegative prompt (avoid): ${negativePrompt}`;
  }
  fullPrompt += `\n\nAspect ratio: ${aspectRatio}`;

  // Build request body for Gemini API
  const requestBody: any = {
    contents: [{
      parts: [{
        text: mode === "edit"
          ? `Edit this image based on the following instructions: ${fullPrompt}`
          : `Generate an image: ${fullPrompt}`
      }]
    }],
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      candidateCount: numImages,
      maxOutputTokens: 2048
    }
  };

  // Add reference image for editing mode
  if (mode === "edit" && referenceImage) {
    requestBody.contents[0].parts.unshift({
      inline_data: {
        mime_type: "image/png",
        data: referenceImage
      }
    });
  }

  // Call Gemini API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();

  // Extract generated images from response
  const images: ImageGenerationResult['images'] = [];

  if (data.candidates && data.candidates.length > 0) {
    for (const candidate of data.candidates) {
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // Handle inline data (base64 images)
          if (part.inline_data) {
            images.push({
              base64: part.inline_data.data,
              metadata: {
                prompt,
                model: "gemini-2.5-flash-image",
                aspectRatio,
                generatedAt: new Date().toISOString()
              }
            });
          }
          // Handle text responses (URLs or descriptions)
          if (part.text && part.text.startsWith("http")) {
            images.push({
              url: part.text,
              metadata: {
                prompt,
                model: "gemini-2.5-flash-image",
                aspectRatio,
                generatedAt: new Date().toISOString()
              }
            });
          }
        }
      }
    }
  }

  // Calculate usage and cost
  const usage = data.usageMetadata ? {
    inputTokens: data.usageMetadata.promptTokenCount || 0,
    outputTokens: data.usageMetadata.candidatesTokenCount || 0,
    cost: calculateCost(
      data.usageMetadata.promptTokenCount || 0,
      data.usageMetadata.candidatesTokenCount || 0,
      images.length
    )
  } : undefined;

  return {
    success: true,
    images,
    usage,
    provider: "google-gemini"
  };
}

// Calculate cost for Gemini image generation
function calculateCost(inputTokens: number, outputTokens: number, numImages: number): number {
  const inputCost = (inputTokens / 1_000_000) * 0.30;
  const outputCost = (outputTokens / 1_000_000) * 2.50;
  const imageCost = (numImages / 1000) * 0.03;
  return inputCost + outputCost + imageCost;
}

export const runtime = "nodejs";
export const maxDuration = 60; // Image generation can take longer
