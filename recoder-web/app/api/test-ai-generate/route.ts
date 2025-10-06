import { NextRequest } from "next/server";
import { z } from "zod";
import { generateWebCode } from "@/lib/unified-web-ai";
import type { WebGenerationOptions } from "@/lib/unified-web-ai";
import { generateCodeUnified } from "@/lib/ai-integration";
import { withErrorHandler, createApiResponse, ErrorCode, createApiError } from "@/lib/api-error-handler";

// Request schema validation
const generateRequestSchema = z.object({
  prompt: z.string(),
  model: z.string().optional(),
  provider: z.string().optional(),
  quality: z.enum(["high", "low"]).default("high"),
  options: z.object({
    language: z.string().optional(),
    framework: z.string().optional(),
    includeTests: z.boolean().optional(),
    includeDocs: z.boolean().optional(),
    realCode: z.boolean().default(true),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(100).max(10000).optional()
  }).optional()
});

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  const { prompt, model, provider, quality, options } = generateRequestSchema.parse(body);

    // Test both AI integration systems
    console.log('Testing AI integration modules...');

    // Build generation options
    const generationOptions: WebGenerationOptions = {
      preferredProvider: provider,
      model,
      temperature: quality === "high" ? 0.1 : 0.3,
      maxTokens: quality === "high" ? 8000 : 4000,
      language: options?.language || "typescript",
      framework: options?.framework || "react",
      includeTests: options?.includeTests || false,
      includeDocs: options?.includeDocs || false,
      costOptimized: true
    };

    // Test unified web AI generation
    try {
      const result = await generateWebCode(prompt, generationOptions);
      
      return createApiResponse({
        system: 'unified-web-ai',
        result: {
          code: result.code,
          explanation: result.explanation,
          provider: result.provider,
          model: result.model,
          language: result.metadata.language,
          framework: result.metadata.framework,
          dependencies: result.metadata.dependencies,
          realFunctionality: result.metadata.realFunctionality,
          tokens: result.tokens,
          confidence: result.confidence
        }
      });

    } catch (unifiedError) {
      console.log('Unified Web AI failed, trying legacy ai-integration:', unifiedError);
      
      // Fallback to legacy ai-integration
      try {
        const legacyResult = await generateCodeUnified(prompt, generationOptions);
        
        return createApiResponse({
          system: 'ai-integration-legacy',
          result: legacyResult,
          fallbackReason: unifiedError instanceof Error ? unifiedError.message : 'Unknown error'
        });

      } catch (legacyError) {
        throw new Error(`Both AI systems failed. Unified: ${unifiedError instanceof Error ? unifiedError.message : 'Unknown'}. Legacy: ${legacyError instanceof Error ? legacyError.message : 'Unknown'}`);
      }
    }
}

// Export POST handler directly (using custom response format)
export async function POST(req: NextRequest) {
  try {
    return await handlePOST(req);
  } catch (error) {
    console.error('AI generation test failed:', error);
    return createApiError(
      ErrorCode.AI_PROVIDER_ERROR,
      error instanceof Error ? error.message : 'AI generation failed',
      500
    );
  }
}

// Use Node.js runtime to avoid Prisma edge issues
export const runtime = "nodejs";