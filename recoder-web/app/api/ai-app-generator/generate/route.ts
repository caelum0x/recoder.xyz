import { NextRequest, NextResponse } from 'next/server';
import { openRouterProvider } from '@/lib/ai/openrouter-provider';
import { fileSystemManager } from '@/lib/ai-app-generator/file-system-manager';
import { codeExecutor } from '@/lib/ai-app-generator/code-executor';
import { projectAnalyzer } from '@/lib/ai-app-generator/project-analyzer';

interface GenerateRequest {
  message: string;
  currentFiles: FileNode[];
  activeFile?: string;
  sessionId: string;
  framework: string;
}

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { message, currentFiles, activeFile, sessionId, framework } = body;

    // Analyze the current project structure
    const projectContext = await projectAnalyzer.analyzeProject({
      files: currentFiles,
      framework,
      activeFile
    });

    // Create enhanced prompt with project context
    const enhancedPrompt = `
You are an expert full-stack developer helping to build a ${framework} application. 

Current project structure:
${projectContext.structure}

Current file (${activeFile}):
${projectContext.activeFileContent}

User request: ${message}

Please provide:
1. A clear explanation of what you'll implement
2. Updated or new file contents with complete, working code
3. Any dependencies that need to be added
4. Next steps or suggestions

Format your response as JSON:
{
  "message": "Your explanation",
  "fileChanges": [
    {
      "path": "file/path",
      "content": "complete file content",
      "action": "create|update|delete"
    }
  ],
  "dependencies": ["package-name@version"],
  "suggestions": ["suggestion 1", "suggestion 2"]
}

Focus on writing production-ready, complete code that actually works. No placeholders or TODO comments.
`;

    // Call OpenRouter API with Claude Sonnet
    const aiResponse = await openRouterProvider.chat({
      model: 'anthropic/claude-3-sonnet-20240229',
      messages: [
        {
          role: 'system',
          content: 'You are an expert full-stack developer. Always provide complete, working code with no placeholders.'
        },
        {
          role: 'user',
          content: enhancedPrompt
        }
      ],
      temperature: 0.1,
      max_tokens: 8000
    });

    let parsedResponse;
    try {
      // Try to parse JSON response
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback if not proper JSON
        parsedResponse = {
          message: aiResponse.content,
          fileChanges: [],
          dependencies: [],
          suggestions: []
        };
      }
    } catch (parseError) {
      parsedResponse = {
        message: aiResponse.content,
        fileChanges: [],
        dependencies: [],
        suggestions: []
      };
    }

    // Apply file changes to the project
    const updatedFiles = await fileSystemManager.applyChanges({
      currentFiles,
      changes: parsedResponse.fileChanges,
      sessionId
    });

    // Install dependencies if needed
    if (parsedResponse.dependencies?.length > 0) {
      await fileSystemManager.updateDependencies({
        files: updatedFiles,
        dependencies: parsedResponse.dependencies,
        sessionId
      });
    }

    // Generate preview if this is a runnable app
    let previewUrl = null;
    if (framework === 'react' || framework === 'next') {
      try {
        previewUrl = await codeExecutor.generatePreview({
          files: updatedFiles,
          framework,
          sessionId
        });
      } catch (previewError) {
        console.error('Preview generation failed:', previewError);
      }
    }

    return NextResponse.json({
      success: true,
      message: parsedResponse.message,
      updatedFiles,
      fileChanges: parsedResponse.fileChanges?.map((c: { path: any; }) => c.path) || [],
      codeBlocks: extractCodeBlocks(parsedResponse.message),
      suggestions: parsedResponse.suggestions || [],
      dependencies: parsedResponse.dependencies || [],
      previewUrl,
      metadata: {
        model: 'claude-3-sonnet',
        tokensUsed: aiResponse.usage?.total_tokens || 0,
        processingTime: Date.now()
      }
    });

  } catch (error) {
    console.error('AI generation error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to generate code',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function extractCodeBlocks(content: string) {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
  const blocks = [];
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2]
    });
  }

  return blocks;
}