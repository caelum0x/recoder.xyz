import { NextRequest, NextResponse } from 'next/server';
import { codeExecutor } from '@/lib/ai-app-generator/code-executor';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

interface PreviewRequest {
  files: FileNode[];
  framework: string;
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PreviewRequest = await request.json();
    const { files, framework } = body;
    
    // Generate a session ID if not provided
    const sessionId = body.sessionId || `preview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('Generating preview for framework:', framework);

    // Generate preview using code executor
    const previewUrl = await codeExecutor.generatePreview({
      files,
      framework,
      sessionId
    });

    if (!previewUrl) {
      return NextResponse.json({
        success: false,
        error: 'Failed to generate preview'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      previewUrl,
      sessionId,
      message: 'Preview generated successfully'
    });

  } catch (error) {
    console.error('Preview generation error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to generate preview',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}