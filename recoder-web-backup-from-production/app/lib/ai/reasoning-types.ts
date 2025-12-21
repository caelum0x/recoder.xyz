export interface ReasoningStep {
  id: string;
  title: string;
  description: string;
  status: 'thinking' | 'complete' | 'error';
  timestamp: Date;
  duration?: number;
}
