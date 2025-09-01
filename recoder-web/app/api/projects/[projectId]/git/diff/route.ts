import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface GitDiffRequest {
  filePath: string;
  base: string;
  target: string;
}

interface DiffChunk {
  oldStart: number;
  oldLength: number;
  newStart: number;
  newLength: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

async function parseGitDiff(projectPath: string, filePath: string, base: string, target: string): Promise<DiffChunk[]> {
  try {
    const { stdout: diffOutput } = await execAsync(
      `cd "${projectPath}" && git diff --unified=3 ${base}..${target} -- "${filePath}"`,
      { timeout: 30000 }
    );

    if (!diffOutput.trim()) {
      return [];
    }

    const chunks: DiffChunk[] = [];
    const lines = diffOutput.split('\n');
    let currentChunk: DiffChunk | null = null;
    let oldLineNumber = 0;
    let newLineNumber = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Parse chunk header (e.g., @@ -1,4 +1,6 @@)
      const chunkHeaderMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (chunkHeaderMatch) {
        // Save previous chunk if exists
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        // Start new chunk
        const oldStart = parseInt(chunkHeaderMatch[1]);
        const oldLength = parseInt(chunkHeaderMatch[2]) || 1;
        const newStart = parseInt(chunkHeaderMatch[3]);
        const newLength = parseInt(chunkHeaderMatch[4]) || 1;

        currentChunk = {
          oldStart,
          oldLength,
          newStart,
          newLength,
          lines: []
        };

        oldLineNumber = oldStart;
        newLineNumber = newStart;
        continue;
      }

      // Skip file headers
      if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) {
        continue;
      }

      // Parse diff lines
      if (currentChunk) {
        const content = line.slice(1); // Remove the first character (+, -, or space)
        
        if (line.startsWith('+')) {
          // Addition
          currentChunk.lines.push({
            type: 'add',
            newLineNumber: newLineNumber++,
            content
          });
        } else if (line.startsWith('-')) {
          // Deletion
          currentChunk.lines.push({
            type: 'remove',
            oldLineNumber: oldLineNumber++,
            content
          });
        } else if (line.startsWith(' ')) {
          // Context (unchanged)
          currentChunk.lines.push({
            type: 'context',
            oldLineNumber: oldLineNumber++,
            newLineNumber: newLineNumber++,
            content
          });
        }
      }
    }

    // Add the last chunk
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;

  } catch (error) {
    console.error('Error parsing git diff:', error);
    throw new Error(`Failed to parse git diff: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = params;
    const body: GitDiffRequest = await request.json();

    if (!body.filePath || !body.base || !body.target) {
      return NextResponse.json(
        { error: 'Missing required fields: filePath, base, target' },
        { status: 400 }
      );
    }

    // Construct project path
    const projectPath = path.join(process.cwd(), 'user_projects', projectId);

    // Parse git diff
    const chunks = await parseGitDiff(
      projectPath,
      body.filePath,
      body.base,
      body.target
    );

    // Calculate diff statistics
    let totalAdditions = 0;
    let totalDeletions = 0;
    
    chunks.forEach(chunk => {
      chunk.lines.forEach(line => {
        if (line.type === 'add') totalAdditions++;
        if (line.type === 'remove') totalDeletions++;
      });
    });

    // Log analytics
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analytics/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          feature: 'git_diff',
          action: 'view_file_diff',
          metadata: {
            projectId,
            filePath: body.filePath,
            base: body.base,
            target: body.target,
            chunksCount: chunks.length,
            additions: totalAdditions,
            deletions: totalDeletions
          }
        })
      });
    } catch (analyticsError) {
      console.error('Failed to log analytics:', analyticsError);
    }

    return NextResponse.json({
      success: true,
      chunks,
      stats: {
        additions: totalAdditions,
        deletions: totalDeletions,
        chunksCount: chunks.length
      },
      meta: {
        filePath: body.filePath,
        base: body.base,
        target: body.target,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Git diff API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate diff' 
      },
      { status: 500 }
    );
  }
}
