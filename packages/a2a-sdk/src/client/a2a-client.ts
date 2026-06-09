import type { TaskEnvelope } from '../schemas/task-envelope';

export type A2AClientOptions = {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
};

export class A2AClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: A2AClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(): HeadersInit {
    return {
      'content-type': 'application/json',
      ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
    };
  }

  async listTasks(): Promise<TaskEnvelope[]> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/api/a2a/tasks`, {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`A2A listTasks failed: ${response.status}`);
    const body = await response.json();
    return Array.isArray(body?.data) ? body.data : body;
  }

  async sendMessage(envelope: TaskEnvelope): Promise<unknown> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/api/a2a/message`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(envelope),
    });
    if (!response.ok) throw new Error(`A2A sendMessage failed: ${response.status}`);
    return response.json();
  }

  async cancelTask(taskId: string): Promise<unknown> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/api/a2a/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`A2A cancelTask failed: ${response.status}`);
    return response.json();
  }
}
