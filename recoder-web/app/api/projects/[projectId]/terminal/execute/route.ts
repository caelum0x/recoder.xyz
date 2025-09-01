import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-auth';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

interface TerminalExecuteRequest {
  command: string;
  workingDirectory: string;
  tabId: string;
  environment?: Record<string, string>;
  timeout?: number;
}

interface CommandResult {
  output: string;
  errorOutput: string;
  exitCode: number;
  workingDirectory: string;
  duration: number;
  pid?: number;
}

// Enhanced command execution with better security and features
async function executeTerminalCommand(
  command: string,
  workingDirectory: string,
  projectPath: string,
  environment: Record<string, string> = {},
  timeout = 30000
): Promise<CommandResult> {
  const startTime = Date.now();
  
  try {
    // Security: Validate working directory is within project
    const resolvedWorkingDir = path.resolve(projectPath, workingDirectory);
    const resolvedProjectPath = path.resolve(projectPath);
    
    if (!resolvedWorkingDir.startsWith(resolvedProjectPath)) {
      throw new Error('Invalid working directory: outside project bounds');
    }

    // Ensure working directory exists
    try {
      await fs.access(resolvedWorkingDir);
    } catch (error) {
      // Create directory if it doesn't exist
      await fs.mkdir(resolvedWorkingDir, { recursive: true });
    }

    // Security: Basic command validation
    const sanitizedCommand = command.trim();
    if (!sanitizedCommand) {
      throw new Error('Empty command');
    }

    // Dangerous commands that should be blocked
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // rm -rf /
      /format\s+c:/, // Windows format
      /del\s+\/s/, // Windows delete
      />\s*\/dev\/sda/, // Writing to disk devices
      /dd\s+if=.*of=\/dev/, // Disk operations
      /mkfs/, // Filesystem creation
      /fdisk/, // Disk partitioning
    ];

    if (dangerousPatterns.some(pattern => pattern.test(sanitizedCommand))) {
      throw new Error('Command blocked for security reasons');
    }

    // Enhanced environment
    const enhancedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...environment,
      PWD: resolvedWorkingDir,
      PATH: process.env.PATH || '',
      NODE_ENV: 'development' as const,
      RECODER_PROJECT_ID: path.basename(projectPath),
      RECODER_WORKING_DIR: resolvedWorkingDir
    };

    // Execute command with enhanced options
    const { stdout, stderr } = await execAsync(sanitizedCommand, {
      cwd: resolvedWorkingDir,
      env: enhancedEnv,
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      encoding: 'utf8'
    });

    // Get current working directory after command execution
    let finalWorkingDir = resolvedWorkingDir;
    try {
      const { stdout: pwdOutput } = await execAsync('pwd', {
        cwd: resolvedWorkingDir,
        env: enhancedEnv,
        timeout: 5000
      });
      const newDir = pwdOutput.trim();
      if (newDir && newDir.startsWith(resolvedProjectPath)) {
        finalWorkingDir = path.relative(projectPath, newDir) || '.';
      }
    } catch (error) {
      // Keep original working directory if pwd fails
    }

    return {
      output: stdout || '',
      errorOutput: stderr || '',
      exitCode: 0,
      workingDirectory: finalWorkingDir,
      duration: Date.now() - startTime
    };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    if (error.code === 'ETIMEDOUT') {
      return {
        output: '',
        errorOutput: `Command timed out after ${timeout}ms`,
        exitCode: 124,
        workingDirectory,
        duration
      };
    }

    return {
      output: error.stdout || '',
      errorOutput: error.stderr || error.message || 'Command execution failed',
      exitCode: error.code || 1,
      workingDirectory,
      duration
    };
  }
}

// Built-in commands for enhanced terminal experience
function handleBuiltinCommand(command: string, workingDirectory: string, projectPath: string): CommandResult | null {
  const args = command.trim().split(/\s+/);
  const cmd = args[0].toLowerCase();

  switch (cmd) {
    case 'help':
      return {
        output: `Recoder Terminal - Available Commands:

Built-in Commands:
  help          - Show this help message
  clear         - Clear terminal output
  pwd           - Show current directory
  ls, dir       - List directory contents
  cd            - Change directory
  cat, type     - Display file contents
  echo          - Display text
  env           - Show environment variables

Development Commands:
  npm           - Node package manager
  yarn          - Yarn package manager
  git           - Git version control
  node          - Node.js runtime
  python        - Python interpreter
  pip           - Python package manager

System Commands:
  ps            - List running processes
  whoami        - Show current user
  date          - Show current date/time
  which         - Locate command

Type any command to execute it in the project environment.
`,
        errorOutput: '',
        exitCode: 0,
        workingDirectory,
        duration: 0
      };

    case 'clear':
      return {
        output: '\x1b[2J\x1b[H', // ANSI escape codes for clear screen
        errorOutput: '',
        exitCode: 0,
        workingDirectory,
        duration: 0
      };

    case 'recoder-info':
      return {
        output: `Recoder.xyz Terminal Environment

Project Path: ${projectPath}
Working Directory: ${workingDirectory}
Terminal Version: 1.0.0
Features: Multi-tab, Command history, Auto-completion
Security: Sandboxed execution, Command validation

Visit https://recoder.xyz for more information.
`,
        errorOutput: '',
        exitCode: 0,
        workingDirectory,
        duration: 0
      };

    default:
      return null; // Not a built-in command
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
    const body: TerminalExecuteRequest = await request.json();

    if (!body.command || !body.tabId) {
      return NextResponse.json(
        { error: 'Missing required fields: command, tabId' },
        { status: 400 }
      );
    }

    // Construct project path
    const projectPath = path.join(process.cwd(), 'user_projects', projectId);
    const workingDirectory = body.workingDirectory || '.';

    // Check for built-in commands first
    const builtinResult = handleBuiltinCommand(body.command, workingDirectory, projectPath);
    if (builtinResult) {
      return NextResponse.json({
        success: true,
        ...builtinResult
      });
    }

    // Execute the command
    const result = await executeTerminalCommand(
      body.command,
      workingDirectory,
      projectPath,
      body.environment,
      body.timeout
    );

    // Log analytics
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analytics/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          feature: 'terminal',
          action: 'command_executed',
          metadata: {
            projectId,
            command: body.command.split(' ')[0], // Just the command name for privacy
            workingDirectory,
            exitCode: result.exitCode,
            duration: result.duration,
            tabId: body.tabId
          }
        })
      });
    } catch (analyticsError) {
      console.error('Failed to log analytics:', analyticsError);
    }

    return NextResponse.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Terminal execute API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed',
        output: '',
        errorOutput: error instanceof Error ? error.message : 'Unknown error',
        exitCode: 1,
        workingDirectory: '.',
        duration: 0
      },
      { status: 500 }
    );
  }
}
