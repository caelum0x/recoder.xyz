/**
 * AI Model Router
 * Intelligent routing between different AI models
 */

export class AIModelRouter {
  private modelCapabilities: Map<string, string[]> = new Map();

  constructor(private config: any) {
    this.setupModelCapabilities();
  }

  private setupModelCapabilities(): void {
    this.modelCapabilities.set('claude-3-sonnet', [
      'complex-reasoning',
      'code-analysis',
      'security-review',
      'refactoring'
    ]);
    
    this.modelCapabilities.set('gemini-2.0-flash', [
      'fast-completion',
      'multimodal',
      'large-context'
    ]);
    
    this.modelCapabilities.set('groq-llama', [
      'rapid-response',
      'code-generation',
      'simple-tasks'
    ]);
  }

  selectBestModel(taskType: string, context?: any): string {
    // Simple routing logic - will be enhanced in future phases
    switch (taskType) {
      case 'completion':
        return 'groq-llama'; // Fast for completions
      case 'refactoring':
        return 'claude-3-sonnet'; // Best for complex analysis
      case 'analysis':
        return 'claude-3-sonnet'; // Best for deep analysis
      case 'generation':
        return 'gemini-2.0-flash'; // Good balance
      default:
        return 'claude-3-sonnet';
    }
  }

  getModelCapabilities(model: string): string[] {
    return this.modelCapabilities.get(model) || [];
  }

  isModelAvailable(model: string): boolean {
    return this.modelCapabilities.has(model);
  }
}