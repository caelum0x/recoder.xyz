import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { generateImage } from '@/lib/ai/image-generation';
import { getModelById } from '@/lib/ai/model-registry';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { prompt, model, size, quality, style, n } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Validate model
    const modelInfo = getModelById(model || 'google/gemini-2.5-flash-image');
    if (!modelInfo || !modelInfo.capabilities.imageGeneration) {
      return NextResponse.json(
        { error: 'Invalid or unsupported model for image generation' },
        { status: 400 }
      );
    }

    // Generate image
    console.log(`Generating image for user ${session.user.id} with model ${modelInfo.name}`);

    const result = await generateImage({
      prompt,
      model,
      size,
      quality,
      style,
      n,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Image generation API error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Image generation failed',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
