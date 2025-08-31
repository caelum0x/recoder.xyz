import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      description,
      projectType = 'react',
      framework = 'react',
      features = [],
      style = 'modern',
      complexity = 'medium',
      userId = 'anonymous'
    } = body;

    const finalDescription = description || prompt;

    if (!finalDescription) {
      return NextResponse.json(
        { success: false, error: 'Project description is required' },
        { status: 400 }
      );
    }

    logger.info('Starting code generation via production engine', { 
      description: finalDescription.substring(0, 100), 
      projectType, 
      framework,
      features,
      style, 
      complexity,
      userId
    });

    // Connect to production engine for code generation
    const engineUrl = process.env.PRODUCTION_ENGINE_URL || 'http://localhost:8001';
    const generateUrl = `${engineUrl}/api/generate`;

    logger.info('Connecting to production engine', { generateUrl });

    const response = await fetch(generateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.UNIFIED_AUTH_SECRET || 'dev-token'}`
      },
      body: JSON.stringify({
        description: finalDescription,
        type: projectType,
        framework: framework || projectType,
        features: features,
        outputPath: './generated',
        userId: userId,
        options: {
          style,
          complexity,
          includeTests: true,
          includeReadme: true,
          includeDependencies: true
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Production engine request failed', { 
        status: response.status, 
        statusText: response.statusText,
        error: errorText 
      });
      
      return NextResponse.json(
        { 
          success: false, 
          error: `Production engine error: ${response.status} ${response.statusText}`,
          details: errorText
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    
    logger.info('Code generation completed successfully', { 
      success: result.success,
      filesGenerated: result.files?.length || 0
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Code generated successfully via production engine'
    });

  } catch (error) {
    logger.error('Code generation failed', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to generate code',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Code generation API ready',
    engine: process.env.PRODUCTION_ENGINE_URL || 'http://localhost:8001',
    timestamp: new Date().toISOString()
  });
}
