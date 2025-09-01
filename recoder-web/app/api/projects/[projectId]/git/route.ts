import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const projectPath = path.join(process.cwd(), 'projects', projectId);

    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({
        success: false,
        error: 'Project not found'
      }, { status: 404 });
    }

    // Check if git repository exists
    const gitPath = path.join(projectPath, '.git');
    if (!fs.existsSync(gitPath)) {
      return NextResponse.json({
        success: false,
        error: 'Git repository not initialized'
      }, { status: 404 });
    }

    // Get git status
    const status = await execGitCommand(projectPath, ['status', '--porcelain', '-b']);
    const parsed = parseGitStatus(status);

    return NextResponse.json({
      success: true,
      data: {
        status: parsed
      }
    });

  } catch (error) {
    logger.error('Error getting git status:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get git status'
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { action, data } = await request.json();
    const projectPath = path.join(process.cwd(), 'projects', projectId);

    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({
        success: false,
        error: 'Project not found'
      }, { status: 404 });
    }

    switch (action) {
      case 'init':
        return await initRepository(projectPath, data?.repoUrl);
      
      case 'add':
        return await addFiles(projectPath, data?.files || []);
      
      case 'commit':
        return await commitChanges(projectPath, data?.message);
      
      case 'push':
        return await pushChanges(projectPath);
      
      case 'pull':
        return await pullChanges(projectPath);
      
      case 'branch':
        return await createBranch(projectPath, data?.branchName);
      
      case 'checkout':
        return await checkoutBranch(projectPath, data?.branchName);
      
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 });
    }

  } catch (error) {
    logger.error('Error executing git command:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to execute git command'
    }, { status: 500 });
  }
}

async function execGitCommand(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const git = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';

    git.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    git.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    git.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Git command failed with code ${code}`));
      }
    });
  });
}

function parseGitStatus(output: string) {
  const lines = output.trim().split('\n');
  const branchLine = lines[0];
  const statusLines = lines.slice(1);

  // Parse branch info
  let branch = 'main';
  let ahead = 0;
  let behind = 0;

  if (branchLine.startsWith('## ')) {
    const branchInfo = branchLine.substring(3);
    const parts = branchInfo.split('...');
    branch = parts[0];

    if (parts[1]) {
      const tracking = parts[1];
      const aheadMatch = tracking.match(/ahead (\d+)/);
      const behindMatch = tracking.match(/behind (\d+)/);
      
      if (aheadMatch) ahead = parseInt(aheadMatch[1]);
      if (behindMatch) behind = parseInt(behindMatch[1]);
    }
  }

  // Parse file status
  const modified: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const untracked: string[] = [];

  statusLines.forEach(line => {
    if (line.trim() === '') return;
    
    const status = line.substring(0, 2);
    const file = line.substring(3);

    if (status === '??') {
      untracked.push(file);
    } else if (status[0] === 'A' || status[1] === 'A') {
      added.push(file);
    } else if (status[0] === 'M' || status[1] === 'M') {
      modified.push(file);
    } else if (status[0] === 'D' || status[1] === 'D') {
      deleted.push(file);
    }
  });

  return {
    branch,
    ahead,
    behind,
    modified,
    added,
    deleted,
    untracked
  };
}

async function initRepository(projectPath: string, repoUrl?: string) {
  try {
    await execGitCommand(projectPath, ['init']);
    
    // Set default user if not set
    try {
      await execGitCommand(projectPath, ['config', 'user.name', 'Recoder User']);
      await execGitCommand(projectPath, ['config', 'user.email', 'user@recoder.xyz']);
    } catch (e) {
      // User config might already exist
    }

    if (repoUrl) {
      await execGitCommand(projectPath, ['remote', 'add', 'origin', repoUrl]);
    }

    // Initial commit
    await execGitCommand(projectPath, ['add', '.']);
    await execGitCommand(projectPath, ['commit', '-m', 'Initial commit']);

    return NextResponse.json({
      success: true,
      data: {
        repository: {
          name: path.basename(projectPath),
          url: repoUrl || '',
          branch: 'main',
          lastCommit: {
            hash: await execGitCommand(projectPath, ['rev-parse', 'HEAD']).then(h => h.trim()),
            message: 'Initial commit',
            author: 'Recoder User',
            date: new Date().toISOString()
          },
          status: 'clean'
        }
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Failed to initialize repository: ${error}`
    }, { status: 500 });
  }
}

async function addFiles(projectPath: string, files: string[]) {
  try {
    if (files.length === 0) {
      await execGitCommand(projectPath, ['add', '.']);
    } else {
      await execGitCommand(projectPath, ['add', ...files]);
    }

    return NextResponse.json({
      success: true,
      data: { added: files }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Failed to add files: ${error}`
    }, { status: 500 });
  }
}

async function commitChanges(projectPath: string, message: string) {
  try {
    await execGitCommand(projectPath, ['commit', '-m', message]);
    
    const hash = await execGitCommand(projectPath, ['rev-parse', 'HEAD']);
    const author = await execGitCommand(projectPath, ['log', '-1', '--pretty=format:%an']);
    
    return NextResponse.json({
      success: true,
      data: {
        commit: {
          hash: hash.trim(),
          message,
          author: author.trim(),
          date: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Failed to commit: ${error}`
    }, { status: 500 });
  }
}

async function pushChanges(projectPath: string) {
  try {
    await execGitCommand(projectPath, ['push', 'origin', 'HEAD']);
    
    return NextResponse.json({
      success: true,
      data: { pushed: true }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Failed to push: ${error}`
    }, { status: 500 });
  }
}

async function pullChanges(projectPath: string) {
  try {
    await execGitCommand(projectPath, ['pull', 'origin', 'HEAD']);
    
    return NextResponse.json({
      success: true,
      data: { pulled: true }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Failed to pull: ${error}`
    }, { status: 500 });
  }
}

async function createBranch(projectPath: string, branchName: string) {
  try {
    await execGitCommand(projectPath, ['checkout', '-b', branchName]);
    
    return NextResponse.json({
      success: true,
      data: { branch: branchName }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Failed to create branch: ${error}`
    }, { status: 500 });
  }
}

async function checkoutBranch(projectPath: string, branchName: string) {
  try {
    await execGitCommand(projectPath, ['checkout', branchName]);
    
    return NextResponse.json({
      success: true,
      data: { branch: branchName }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Failed to checkout branch: ${error}`
    }, { status: 500 });
  }
}
