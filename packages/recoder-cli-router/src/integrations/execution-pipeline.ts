/**
 * Execution Pipeline for Recoder CLI Router
 *
 * Extends the router's AI capabilities with:
 *   1. Daytona sandbox execution - Run code in isolated containers
 *   2. A2A agent delegation     - Route tasks to specialized agents
 *
 * The pipeline inspects incoming requests and decides whether they need
 * sandbox execution or agent delegation, then enriches the response.
 */

import { daytonaSandbox, type SandboxExecResult } from './daytona-sandbox';
import { a2aBridge, type A2ATask, type A2AThread, type AgentId } from './a2a-bridge';

export interface ExecutionRequest {
  prompt: string;
  /** If true, detect and run code blocks in a sandbox */
  autoExecute?: boolean;
  /** If true, detect and delegate to other agents when appropriate */
  autoDelegate?: boolean;
  /** Explicit sandbox execution request */
  sandboxCommand?: string;
  /** Explicit agent delegation request */
  delegateTo?: AgentId;
}

export interface ExecutionResult {
  /** Whether any execution or delegation occurred */
  executed: boolean;
  /** Sandbox execution result, if code was run */
  sandboxResult?: SandboxExecResult;
  /** A2A delegation result, if task was sent to another agent */
  delegationResult?: {
    task: A2ATask;
    thread?: A2AThread;
  };
  /** Combined summary of execution actions taken */
  summary: string;
}

/**
 * Code block extracted from a prompt or AI response
 */
interface CodeBlock {
  language: string;
  code: string;
}

export class ExecutionPipeline {
  /**
   * Process a request through the execution pipeline.
   * Called after AI response generation to optionally run code or delegate.
   */
  async process(request: ExecutionRequest): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      executed: false,
      summary: '',
    };

    // 1. Explicit sandbox command takes priority
    if (request.sandboxCommand) {
      result.sandboxResult = await this.runInSandbox(request.sandboxCommand);
      result.executed = true;
      result.summary = `Sandbox: exit ${result.sandboxResult.exitCode} (${result.sandboxResult.executionTimeMs}ms)`;
      return result;
    }

    // 2. Explicit agent delegation
    if (request.delegateTo) {
      result.delegationResult = await this.delegateToAgent(request.delegateTo, request.prompt);
      result.executed = true;
      result.summary = `Delegated to ${request.delegateTo}`;
      return result;
    }

    // 3. Auto-detect: check if prompt contains executable code
    if (request.autoExecute && daytonaSandbox.isConfigured()) {
      const codeBlocks = this.extractCodeBlocks(request.prompt);
      if (codeBlocks.length > 0) {
        const block = codeBlocks[0]; // Execute the first code block
        const command = this.buildRunCommand(block);
        if (command) {
          try {
            result.sandboxResult = await this.runInSandbox(command);
            result.executed = true;
            result.summary = `Auto-executed ${block.language} code: exit ${result.sandboxResult.exitCode}`;
          } catch (error: any) {
            result.summary = `Auto-execute failed: ${error.message}`;
          }
        }
      }
    }

    // 4. Auto-detect: check if prompt should be delegated
    if (request.autoDelegate && a2aBridge.isConfigured() && !result.executed) {
      if (this.shouldDelegate(request.prompt)) {
        try {
          result.delegationResult = await a2aBridge.delegateTask(request.prompt);
          result.executed = true;
          result.summary = `Auto-delegated to ${result.delegationResult.task.target || 'best agent'}`;
        } catch (error: any) {
          result.summary = `Auto-delegation failed: ${error.message}`;
        }
      }
    }

    if (!result.executed) {
      result.summary = 'No execution or delegation needed';
    }

    return result;
  }

  /**
   * Run a command in a Daytona sandbox (one-shot)
   */
  async runInSandbox(command: string, options?: { image?: string; timeoutMs?: number }): Promise<SandboxExecResult> {
    return daytonaSandbox.run(command, options);
  }

  /**
   * Run a multi-file script in a Daytona sandbox
   */
  async runScript(steps: {
    files?: Array<{ path: string; content: string }>;
    installCommand?: string;
    runCommand: string;
    image?: string;
    timeoutMs?: number;
  }): Promise<SandboxExecResult> {
    return daytonaSandbox.runScript(steps);
  }

  /**
   * Delegate a task to a specific agent
   */
  async delegateToAgent(
    targetAgent: AgentId,
    task: string,
    capability?: 'execute' | 'plan' | 'edit',
  ): Promise<{ task: A2ATask; thread?: A2AThread }> {
    return a2aBridge.delegateTask(task, {
      preferredAgent: targetAgent,
      capability,
    });
  }

  /**
   * Create a new agent thread for complex tasks
   */
  async createAgentThread(prompt: string, agentId?: string): Promise<A2AThread> {
    return a2aBridge.createThread({ prompt, agentId });
  }

  /**
   * List available A2A agents
   */
  async listAgents() {
    return a2aBridge.listAgents();
  }

  /**
   * List A2A tasks
   */
  async listTasks() {
    return a2aBridge.listTasks();
  }

  /**
   * Extract fenced code blocks from markdown-style text
   */
  private extractCodeBlocks(text: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        language: (match[1] || 'shell').toLowerCase(),
        code: match[2].trim(),
      });
    }

    return blocks;
  }

  /**
   * Build a shell command to execute a code block in a sandbox
   */
  private buildRunCommand(block: CodeBlock): string | null {
    switch (block.language) {
      case 'python':
      case 'py':
      case 'python3':
        return `python3 -c ${this.shellEscape(block.code)}`;
      case 'javascript':
      case 'js':
      case 'node':
        return `node -e ${this.shellEscape(block.code)}`;
      case 'typescript':
      case 'ts':
        // Use npx tsx for TypeScript execution
        return `npx -y tsx -e ${this.shellEscape(block.code)}`;
      case 'bash':
      case 'sh':
      case 'shell':
      case 'zsh':
        return block.code;
      default:
        return null; // Unsupported language
    }
  }

  /**
   * Shell-escape a string for safe inclusion in a command
   */
  private shellEscape(str: string): string {
    return "'" + str.replace(/'/g, "'\\''") + "'";
  }

  /**
   * Heuristic: should this prompt be delegated to another agent?
   */
  private shouldDelegate(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    const delegationKeywords = [
      'delegate',
      'send to',
      'ask the',
      'tell the',
      'have the',
      'project manager',
      'agency',
      'deploy to production',
      'create a sprint',
      'manage the project',
      'coordinate with',
    ];

    return delegationKeywords.some(kw => lower.includes(kw));
  }

  /**
   * Get pipeline status for health checks
   */
  getStatus(): {
    sandbox: { configured: boolean; apiUrl: string; activeSandboxes: number };
    a2a: { configured: boolean; apiUrl: string; dockerUrl: string };
  } {
    return {
      sandbox: daytonaSandbox.getStatus(),
      a2a: a2aBridge.getStatus(),
    };
  }
}

// Singleton instance
export const executionPipeline = new ExecutionPipeline();
export default executionPipeline;
