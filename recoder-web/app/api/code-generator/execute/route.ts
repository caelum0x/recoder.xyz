// Code execution API endpoint with real Docker container execution
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { DockerCompilerService } from '@/lib/code-generator/docker-compiler';
import { validateCode } from '@/lib/code-generator/code-validator';
import { createCompilerQueue } from '@/lib/code-generator/compiler-queue';
import rateLimit from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';

// Rate limiting for execution - 50 requests per 5 minutes for free users
const limiter = rateLimit({
  interval: 5 * 60 * 1000, // 5 minutes
  uniqueTokenPerInterval: 1000,
});

export interface ExecutionRequest {
  language: string;
  code: string;
  input?: string;
  options?: {
    timeout?: number; // in seconds, max 30 for free users
    memory?: number; // in MB, max 128 for free users
    args?: string[];
    env?: Record<string, string>;
    libraries?: string[];
    debug?: boolean;
  };
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  stdout?: string;
  stderr?: string;
  executionTime: number;
  memoryUsed: number;
  exitCode: number;
  executionId: string;
  language: string;
  timestamp: string;
  warnings?: string[];
  stats?: {
    linesOfCode: number;
    characters: number;
    peakMemory: number;
    cpuTime: number;
  };
}

export async function POST(request: NextRequest) {
  const executionId = uuidv4();
  const startTime = Date.now();
  
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Authentication required for code execution' 
        }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const userId = session.user.id;

    // Rate limiting check
    try {
      await limiter.check(request, 5, userId); // 5 requests per window
    } catch {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Rate limit exceeded. Please try again later.' 
        }),
        { 
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse request
    const body = await request.json() as ExecutionRequest;
    const { language, code, input = '', options = {} } = body;

    // Validation
    if (!language || !code) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Language and code are required' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Code validation and security checks
    const validationResult = await validateCode(code, language);
    if (!validationResult.isValid) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Code validation failed: ${validationResult.issues.filter(i => i.severity === 'error').map(i => i.message).join(', ')}`,
          warnings: validationResult.issues.filter(i => i.severity === 'warning').map(i => i.message)
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Apply user tier limits
    const timeout = Math.min(options.timeout || 30, 30); // Free tier: max 30 seconds
    const memory = Math.min(options.memory || 128, 128); // Free tier: max 128MB

    // Initialize compiler service
    const compilerService = new DockerCompilerService();
    
    // Create execution task
    const queue = createCompilerQueue();
    const task = {
      id: executionId,
      type: 'execute' as const,
      language,
      code,
      input,
      options: {
        ...options,
        timeout,
        memory,
        userId,
        executionId
      }
    };

    // Execute code in Docker container
    try {
      const result = await compilerService.compile({
        language,
        code,
        input,
        timeout,
        memory,
        compilationId: executionId,
        userId,
        debug: options.debug,
        libraries: options.libraries
      });

      const executionTime = Date.now() - startTime;

      // Parse execution output
      const executionResult: ExecutionResult = {
        success: result.success,
        output: result.output,
        error: result.error,
        stdout: result.output || '',
        stderr: result.error || '',
        executionTime,
        memoryUsed: result.memoryUsed || 0,
        exitCode: result.exitCode || 0,
        executionId,
        language,
        timestamp: new Date().toISOString(),
        warnings: validationResult.issues.filter(i => i.severity === 'warning').map(i => i.message),
        stats: {
          linesOfCode: code.split('\n').length,
          characters: code.length,
          peakMemory: result.memoryUsed || 0,
          cpuTime: executionTime
        }
      };

      // Log execution for analytics
      console.log(`Code execution completed: ${executionId}`, {
        userId,
        language,
        executionTime,
        success: result.success,
        memoryUsed: result.memoryUsed,
        linesOfCode: executionResult.stats?.linesOfCode
      });

      return new Response(
        JSON.stringify(executionResult),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );

    } catch (containerError: any) {
      console.error(`Container execution error for ${executionId}:`, containerError);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Execution failed: ${containerError.message || 'Unknown container error'}`,
          executionId,
          language,
          timestamp: new Date().toISOString(),
          executionTime: Date.now() - startTime
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error: any) {
    console.error(`Execution API error for ${executionId}:`, error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: `Server error: ${error.message || 'Unknown error'}`,
        executionId,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// GET endpoint for execution status and history
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get('id');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (executionId) {
      // Get specific execution result
      // TODO: Implement execution history storage
      return new Response(
        JSON.stringify({ 
          message: 'Execution history not yet implemented',
          executionId 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get execution history for user
    return new Response(
      JSON.stringify({ 
        executions: [],
        total: 0,
        limit,
        offset,
        message: 'Execution history feature coming soon'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Execution GET error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch execution data' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
