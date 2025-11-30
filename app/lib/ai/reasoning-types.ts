export interface ReasoningStep {
  id: string;
  title: string;
  description: string;
  status: 'thinking' | 'complete' | 'error';
  timestamp: Date;
  duration?: number;
}

export interface ReasoningData {
  steps: ReasoningStep[];
  totalDuration?: number;
  isComplete: boolean;
}
