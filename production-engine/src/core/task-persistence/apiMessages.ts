/**
 * API Messages persistence for production engine
 */

export interface TaskMessage {
  id: string;
  taskId: string;
  content: string | any[];
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface MessageBatch {
  taskId: string;
  messages: TaskMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export class ApiMessagesPersistence {
  private messages: Map<string, TaskMessage[]> = new Map();

  async saveMessage(taskId: string, message: TaskMessage): Promise<void> {
    if (!this.messages.has(taskId)) {
      this.messages.set(taskId, []);
    }
    this.messages.get(taskId)?.push(message);
  }

  async getMessages(taskId: string): Promise<TaskMessage[]> {
    return this.messages.get(taskId) || [];
  }

  async deleteMessages(taskId: string): Promise<void> {
    this.messages.delete(taskId);
  }

  async getAllTaskIds(): Promise<string[]> {
    return Array.from(this.messages.keys());
  }
}

// Default export
export default new ApiMessagesPersistence();