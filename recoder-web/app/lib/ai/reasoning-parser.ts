import type { ReasoningStep } from './reasoning-types';

export function parseReasoningSteps(content: string): ReasoningStep[] {
  const steps: ReasoningStep[] = [];
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
  
  let match;
  let stepIndex = 0;
  
  while ((match = thinkingRegex.exec(content)) !== null) {
    const thinkingContent = match[1].trim();
    const lines = thinkingContent.split('\n').filter(l => l.trim());
    
    lines.forEach((line, i) => {
      const stepMatch = line.match(/^(?:Step\s+\d+:|[\d]+\.)\s*(.+)/i);
      if (stepMatch) {
        steps.push({
          id: `step-${stepIndex++}`,
          title: stepMatch[1].trim(),
          description: '',
          status: 'complete',
          timestamp: new Date(),
        });
      }
    });
  }
  
  return steps;
}

export function extractThinkingContent(content: string): string {
  const match = content.match(/<thinking>([\s\S]*?)<\/thinking>/);
  return match ? match[1].trim() : '';
}

export function removeThinkingTags(content: string): string {
  return content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
}
