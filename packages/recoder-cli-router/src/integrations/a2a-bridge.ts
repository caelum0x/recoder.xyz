/**
 * A2A (Agent-to-Agent) Bridge for Recoder CLI Router
 *
 * Allows the router to delegate tasks to other Recoder agents
 * and orchestrate multi-agent workflows across the platform.
 *
 * Configuration via environment variables:
 *   RECODER_API_URL    - Recoder API base URL (default: https://api.recoder.xyz)
 *   RECODER_API_TOKEN  - Bearer token for API authentication
 *   RECODER_DOCKER_URL - Docker backend URL for A2A endpoints (default: https://docker.recoder.xyz)
 */

export interface A2AConfig {
  apiUrl: string;
  apiToken: string;
  dockerUrl: string;
}

export type AgentId =
  | 'codex'
  | 'claude_code'
  | 'recoder_app'
  | 'recoder_agents'
  | 'recoder_pm'
  | 'recoder_agency'
  | string;

export type TaskCapability = 'execute' | 'plan' | 'edit';

export type TaskState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface A2AAgent {
  agent_id: string;
  platform: string;
  enabled: boolean;
  health: string;
  capabilities?: string[];
}

export interface A2ATask {
  id: string;
  source: string;
  target: string;
  task: string;
  capability: TaskCapability;
  state: TaskState;
  result?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface A2AThread {
  threadId: string;
  agentId: string;
  status: string;
  runId?: string;
  viewUrl: string;
}

export interface SendTaskOptions {
  targetAgent: AgentId;
  task: string;
  capability?: TaskCapability;
  fromAgent?: string;
}

export interface CreateThreadOptions {
  prompt: string;
  agentId?: string;
}

export class A2ABridge {
  private config: A2AConfig;

  constructor(config?: Partial<A2AConfig>) {
    this.config = {
      apiUrl: config?.apiUrl || process.env.RECODER_API_URL || 'https://api.recoder.xyz',
      apiToken: config?.apiToken || process.env.RECODER_API_TOKEN || process.env.RECODER_SESSION_TOKEN || '',
      dockerUrl: config?.dockerUrl || process.env.RECODER_DOCKER_URL || 'https://docker.recoder.xyz',
    };
  }

  /**
   * Check if the A2A bridge is properly configured
   */
  isConfigured(): boolean {
    return this.config.apiToken.length > 0;
  }

  /**
   * Build auth headers for the Recoder API
   */
  private getApiHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiToken) {
      headers['Authorization'] = `Bearer ${this.config.apiToken}`;
    }
    return headers;
  }

  /**
   * Build auth headers for the Docker backend (A2A endpoints)
   */
  private getDockerHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiToken) {
      headers['Cookie'] = `recoder.session_token=${this.config.apiToken}`;
    }
    return headers;
  }

  /**
   * List all agents registered on the A2A platform
   */
  async listAgents(): Promise<A2AAgent[]> {
    try {
      const response = await fetch(`${this.config.dockerUrl}/api/a2a/agents`, {
        method: 'GET',
        headers: this.getDockerHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json() as { agents?: A2AAgent[] };
      return data.agents || [];
    } catch (error: any) {
      console.warn(`A2A listAgents failed: ${error.message}`);
      return [];
    }
  }

  /**
   * List recent tasks on the A2A platform
   */
  async listTasks(): Promise<A2ATask[]> {
    try {
      const response = await fetch(`${this.config.dockerUrl}/api/a2a/tasks`, {
        method: 'GET',
        headers: this.getDockerHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json() as { data?: { tasks?: A2ATask[] } };
      return data.data?.tasks || [];
    } catch (error: any) {
      console.warn(`A2A listTasks failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Send a task to another agent on the A2A platform
   */
  async sendTask(options: SendTaskOptions): Promise<A2ATask> {
    if (!this.isConfigured()) {
      throw new Error('A2A bridge not configured: RECODER_API_TOKEN is required');
    }

    const response = await fetch(`${this.config.dockerUrl}/api/a2a/tasks`, {
      method: 'POST',
      headers: this.getDockerHeaders(),
      body: JSON.stringify({
        target: options.targetAgent,
        task: options.task,
        capability: options.capability || 'execute',
        from: options.fromAgent || 'cli_router',
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Failed to send task: HTTP ${response.status} - ${text.slice(0, 200)}`);
    }

    const data = await response.json() as A2ATask;
    return data;
  }

  /**
   * Create a new AI agent thread on agents.recoder.xyz
   * Spins up a Daytona sandbox and starts an AI agent.
   */
  async createThread(options: CreateThreadOptions): Promise<A2AThread> {
    if (!this.isConfigured()) {
      throw new Error('A2A bridge not configured: RECODER_API_TOKEN is required');
    }

    const agentId = options.agentId || '7e91f872-2407-42ac-bfcb-ea69a496e85c';

    // Step 1: Create thread
    const threadResponse = await fetch(`${this.config.apiUrl}/v1/threads`, {
      method: 'POST',
      headers: this.getApiHeaders(),
      body: JSON.stringify({ agent_id: agentId }),
      signal: AbortSignal.timeout(30000),
    });

    if (!threadResponse.ok) {
      const text = await threadResponse.text().catch(() => '');
      throw new Error(`Failed to create thread: HTTP ${threadResponse.status} - ${text.slice(0, 200)}`);
    }

    const threadData = await threadResponse.json() as { thread_id?: string };
    if (!threadData.thread_id) {
      throw new Error(`Failed to create thread: no thread_id returned`);
    }

    const result: A2AThread = {
      threadId: threadData.thread_id,
      agentId,
      status: 'created',
      viewUrl: `https://agents.recoder.xyz/thread/${threadData.thread_id}`,
    };

    // Step 2: Start agent with prompt
    if (options.prompt) {
      try {
        const formData = new URLSearchParams();
        formData.append('prompt', options.prompt);
        formData.append('thread_id', threadData.thread_id);
        formData.append('agent_id', agentId);

        const startResponse = await fetch(`${this.config.apiUrl}/v1/agent/start`, {
          method: 'POST',
          headers: {
            ...this.getApiHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
          signal: AbortSignal.timeout(30000),
        });

        if (startResponse.ok) {
          const startData = await startResponse.json() as { status?: string; agent_run_id?: string };
          result.status = startData.status || 'started';
          result.runId = startData.agent_run_id;
        }
      } catch (error: any) {
        // Thread was created, but agent start failed - non-fatal
        console.warn(`Thread created but agent start failed: ${error.message}`);
        result.status = 'created_no_agent';
      }
    }

    return result;
  }

  /**
   * Delegate a task to the best available agent based on the task description.
   * Returns the task result or thread URL for async tasks.
   */
  async delegateTask(task: string, options?: {
    preferredAgent?: AgentId;
    capability?: TaskCapability;
    waitForResult?: boolean;
  }): Promise<{ task: A2ATask; thread?: A2AThread }> {
    const capability = options?.capability || this.inferCapability(task);
    const targetAgent = options?.preferredAgent || this.inferBestAgent(task);

    // Send task via A2A
    const sentTask = await this.sendTask({
      targetAgent,
      task,
      capability,
    });

    // Optionally create a thread for complex tasks
    let thread: A2AThread | undefined;
    if (capability === 'execute' && task.length > 200) {
      try {
        thread = await this.createThread({ prompt: task });
      } catch {
        // Thread creation is optional
      }
    }

    return { task: sentTask, thread };
  }

  /**
   * Infer the best capability type from the task description
   */
  private inferCapability(task: string): TaskCapability {
    const lower = task.toLowerCase();
    if (lower.includes('plan') || lower.includes('design') || lower.includes('architect') || lower.includes('review')) {
      return 'plan';
    }
    if (lower.includes('edit') || lower.includes('update') || lower.includes('fix') || lower.includes('refactor')) {
      return 'edit';
    }
    return 'execute';
  }

  /**
   * Infer the best target agent from the task description
   */
  private inferBestAgent(task: string): AgentId {
    const lower = task.toLowerCase();

    if (lower.includes('project manage') || lower.includes('sprint') || lower.includes('ticket') || lower.includes('issue')) {
      return 'recoder_pm';
    }
    if (lower.includes('agency') || lower.includes('client') || lower.includes('deliverable') || lower.includes('brief')) {
      return 'recoder_agency';
    }
    if (lower.includes('web') || lower.includes('frontend') || lower.includes('react') || lower.includes('deploy')) {
      return 'recoder_app';
    }
    if (lower.includes('agent') || lower.includes('workflow') || lower.includes('automate') || lower.includes('pipeline')) {
      return 'recoder_agents';
    }

    // Default to claude_code for general development tasks
    return 'claude_code';
  }

  /**
   * Get A2A bridge status for health checks
   */
  getStatus(): { configured: boolean; apiUrl: string; dockerUrl: string } {
    return {
      configured: this.isConfigured(),
      apiUrl: this.config.apiUrl,
      dockerUrl: this.config.dockerUrl,
    };
  }
}

// Singleton instance
export const a2aBridge = new A2ABridge();
export default a2aBridge;
