// Code compilation API endpoint with real Docker container execution
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { DockerCompilerService } from '@/lib/code-generator/docker-compiler';
import { validateCode } from '@/lib/code-generator/code-validator';
import { createCompilerQueue } from '@/lib/code-generator/compiler-queue';
import rateLimit from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';

// Rate limiting for compilation - 30 requests per 5 minutes for free users
const limiter = rateLimit({
  interval: 5 * 60 * 1000, // 5 minutes
  uniqueTokenPerInterval: 1000,
});

export interface CompilationRequest {
  language: string;
  code: string;
  input?: string;
  options?: {
    timeout?: number; // in seconds, max 30 for free users
    memory?: number; // in MB, max 128 for free users
    optimization?: 'none' | 'basic' | 'aggressive';
    debug?: boolean;
    libraries?: string[];
  };
}

export interface CompilationResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTime: number;
  memoryUsed: number;
  exitCode: number;
  compilationId: string;
  language: string;
  timestamp: string;
  warnings?: string[];
  stats?: {
    linesOfCode: number;
    characters: number;
    cyclomatic_complexity?: number;
  };
}

export async function POST(request: NextRequest) {
  const compilationId = uuidv4();
  const startTime = Date.now();

  try {
    // Rate limiting based on user tier
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userTier = session.user.subscription?.tier || 'free';
    const rateLimit = userTier === 'free' ? 30 : userTier === 'pro' ? 100 : 500;

    try {
      await limiter.check(request, rateLimit, `compile-${session.user.id}`);
    } catch {
      return Response.json(
        { error: 'Rate limit exceeded. Please upgrade your plan for higher limits.' },
        { status: 429 }
      );
    }

    const body: CompilationRequest = await request.json();
    const { language, code, input = '', options = {} } = body;

    // Validate request
    if (!language || !code) {
      return Response.json(
        { error: 'Language and code are required' },
        { status: 400 }
      );
    }

    // Code length limits based on user tier
    const maxCodeLength = userTier === 'free' ? 10000 : userTier === 'pro' ? 50000 : 200000;
    if (code.length > maxCodeLength) {
      return Response.json(
        { error: `Code length exceeds limit of ${maxCodeLength} characters for ${userTier} tier` },
        { status: 400 }
      );
    }

    // Timeout limits based on user tier
    const maxTimeout = userTier === 'free' ? 30 : userTier === 'pro' ? 120 : 300;
    const timeout = Math.min(options.timeout || 10, maxTimeout);

    // Memory limits based on user tier
    const maxMemory = userTier === 'free' ? 128 : userTier === 'pro' ? 512 : 2048;
    const memory = Math.min(options.memory || 64, maxMemory);

    // Validate code for security issues
    const codeValidation = validateCode(code, language);
    if (!codeValidation.isValid) {
      return Response.json(
        { 
          error: 'Code validation failed',
          details: codeValidation.issues 
        },
        { status: 400 }
      );
    }

    // Initialize Docker compiler service
    const compiler = new DockerCompilerService();

    // Add job to queue for better resource management
    const queue = createCompilerQueue();
    const jobId = await queue.addCompilationJob({
      compilationId,
      userId: session.user.id,
      language,
      code,
      input,
      options: {
        timeout,
        memory,
        optimization: options.optimization || 'basic',
        debug: options.debug || false,
        libraries: options.libraries || [],
      }
    });

    // Execute compilation in Docker container
    const result = await compiler.compile({
      language,
      code,
      input,
      timeout,
      memory,
      compilationId,
      userId: session.user.id,
      optimization: options.optimization || 'basic',
      debug: options.debug || false,
      libraries: options.libraries || [],
    });

    const executionTime = Date.now() - startTime;

    // Create compilation result
    const compilationResult: CompilationResult = {
      success: result.success,
      output: result.output,
      error: result.error,
      executionTime: executionTime,
      memoryUsed: result.memoryUsed || 0,
      exitCode: result.exitCode || (result.success ? 0 : 1),
      compilationId,
      language,
      timestamp: new Date().toISOString(),
      warnings: result.warnings || [],
      stats: {
        linesOfCode: code.split('\n').length,
        characters: code.length,
        cyclomatic_complexity: result.complexity
      }
    };

    // Log compilation for analytics (without code content for privacy)
    await logCompilationEvent(session.user.id, {
      compilationId,
      language,
      success: result.success,
      executionTime,
      memoryUsed: result.memoryUsed || 0,
      linesOfCode: code.split('\n').length,
      userTier,
      timestamp: new Date().toISOString(),
    });

    // Update user usage stats
    await updateUserUsageStats(session.user.id, {
      compilations: 1,
      executionTime,
      memoryUsed: result.memoryUsed || 0,
    });

    return Response.json(compilationResult);

  } catch (error) {
    console.error('Compilation error:', error);
    
    const executionTime = Date.now() - startTime;
    
    // Log failed compilation
    if (request.body) {
      try {
        const session = await auth();
        if (session?.user?.id) {
          await logCompilationEvent(session.user.id, {
            compilationId,
            language: 'unknown',
            success: false,
            executionTime,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (logError) {
        console.error('Failed to log compilation error:', logError);
      }
    }

    return Response.json(
      { 
        error: 'Compilation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        compilationId,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Get compilation status (for long-running compilations)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const compilationId = url.searchParams.get('id');

    if (!compilationId) {
      return Response.json(
        { error: 'Compilation ID is required' },
        { status: 400 }
      );
    }

    // Get compilation status from queue/cache
    const queue = createCompilerQueue();
    const status = await queue.getJobStatus(compilationId);

    return Response.json(status);

  } catch (error) {
    console.error('Compilation status error:', error);
    return Response.json(
      { error: 'Failed to get compilation status' },
      { status: 500 }
    );
  }
}

// Helper functions
async function logCompilationEvent(userId: string, data: any) {
  try {
    // In production, this would write to analytics database
    console.log(`Compilation Event - User ${userId}:`, data);
  } catch (error) {
    console.error('Failed to log compilation event:', error);
  }
}

async function updateUserUsageStats(userId: string, usage: any) {
  try {
    // In production, this would update user usage statistics
    console.log(`Usage Update - User ${userId}:`, usage);
  } catch (error) {
    console.error('Failed to update usage stats:', error);
  }
}

export const runtime = "edge";