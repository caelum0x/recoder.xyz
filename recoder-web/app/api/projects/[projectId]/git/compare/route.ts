import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface GitCompareRequest {
  base: string;
  target: string;
  includeContent?: boolean;
}

interface FileChange {
  id: string;
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  path: string;
  oldPath?: string;
  newContent?: string;
  oldContent?: string;
  additions: number;
  deletions: number;
  binary: boolean;
  timestamp: string;
  author: string;
}

async function getGitChanges(projectPath: string, base: string, target: string, includeContent = false): Promise<FileChange[]> {
  try {
    // Get the diff between branches
    const { stdout: diffOutput } = await execAsync(
      `cd "${projectPath}" && git diff --name-status --numstat ${base}..${target}`,
      { timeout: 30000 }
    );

    if (!diffOutput.trim()) {
      return [];
    }

    const changes: FileChange[] = [];
    const lines = diffOutput.trim().split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Parse git diff output
      const parts = line.split('\t');
      if (parts.length < 2) continue;

      const status = parts[0];
      const filePath = parts[parts.length - 1];
      
      let type: FileChange['type'] = 'modified';
      let oldPath: string | undefined;
      
      if (status.startsWith('A')) {
        type = 'added';
      } else if (status.startsWith('D')) {
        type = 'deleted';
      } else if (status.startsWith('R')) {
        type = 'renamed';
        oldPath = parts[1];
      } else if (status.startsWith('M')) {
        type = 'modified';
      }

      // Get file stats
      let additions = 0;
      let deletions = 0;
      
      try {
        const { stdout: statOutput } = await execAsync(
          `cd "${projectPath}" && git diff --numstat ${base}..${target} -- "${filePath}"`,
          { timeout: 10000 }
        );
        
        const statParts = statOutput.trim().split('\t');
        if (statParts.length >= 2) {
          additions = parseInt(statParts[0]) || 0;
          deletions = parseInt(statParts[1]) || 0;
        }
      } catch (error) {
        console.warn(`Failed to get stats for ${filePath}:`, error);
      }

      // Get author and timestamp
      let author = 'Unknown';
      let timestamp = new Date().toISOString();
      
      try {
        const { stdout: logOutput } = await execAsync(
          `cd "${projectPath}" && git log --pretty=format:"%an|%ad" --date=iso -1 ${target} -- "${filePath}"`,
          { timeout: 10000 }
        );
        
        if (logOutput.trim()) {
          const [authorName, authorDate] = logOutput.trim().split('|');
          author = authorName || 'Unknown';
          timestamp = new Date(authorDate || Date.now()).toISOString();
        }
      } catch (error) {
        console.warn(`Failed to get author for ${filePath}:`, error);
      }

      // Check if file is binary first
      let binary = false;
      try {
        const { stdout: binaryCheck } = await execAsync(
          `cd "${projectPath}" && git diff --numstat ${base}..${target} -- "${filePath}" | grep -q "^-" && echo "binary" || echo "text"`,
          { timeout: 5000 }
        );
        binary = binaryCheck.trim() === 'binary';
      } catch (error) {
        // Assume text file if check fails
        binary = false;
      }

      // Get file content if requested
      let newContent: string | undefined;
      let oldContent: string | undefined;
      
      if (includeContent && type !== 'deleted' && !binary) {
        try {
          const { stdout: newContentOutput } = await execAsync(
            `cd "${projectPath}" && git show ${target}:"${filePath}"`,
            { timeout: 10000 }
          );
          newContent = newContentOutput;
        } catch (error) {
          console.warn(`Failed to get new content for ${filePath}:`, error);
        }
        
        if (type !== 'added') {
          try {
            const { stdout: oldContentOutput } = await execAsync(
              `cd "${projectPath}" && git show ${base}:"${filePath}"`,
              { timeout: 10000 }
            );
            oldContent = oldContentOutput;
          } catch (error) {
            console.warn(`Failed to get old content for ${filePath}:`, error);
          }
        }
      }

      changes.push({
        id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        path: filePath,
        oldPath,
        newContent,
        oldContent,
        additions,
        deletions,
        binary,
        timestamp,
        author
      });
    }

    return changes;
    
  } catch (error) {
    console.error('Error getting git changes:', error);
    throw new Error(`Failed to get git changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    const body: GitCompareRequest = await request.json();

    if (!body.base || !body.target) {
      return NextResponse.json(
        { error: 'Missing required fields: base, target' },
        { status: 400 }
      );
    }

    // Construct project path
    const projectPath = path.join(process.cwd(), 'user_projects', projectId);

    // Get git changes
    const changes = await getGitChanges(
      projectPath, 
      body.base, 
      body.target, 
      body.includeContent
    );

    // Log analytics
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analytics/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          feature: 'git_compare',
          action: 'compare_branches',
          metadata: {
            projectId,
            base: body.base,
            target: body.target,
            changesCount: changes.length
          }
        })
      });
    } catch (analyticsError) {
      console.error('Failed to log analytics:', analyticsError);
    }

    return NextResponse.json({
      success: true,
      changes,
      meta: {
        base: body.base,
        target: body.target,
        changesCount: changes.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Git compare API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to compare branches' 
      },
      { status: 500 }
    );
  }
}
