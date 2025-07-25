/**
 * Reasoning Visualization Page for Recoder.xyz
 * 
 * Main page for DeepSeek R1 transparent thinking and reasoning analysis
 */

import ReasoningVisualization from '@/components/reasoning/reasoning-visualization';

export default function ReasoningPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <ReasoningVisualization />
    </div>
  );
}

export const metadata = {
  title: 'AI Reasoning - Recoder.xyz',
  description: 'Transparent thinking and step-by-step reasoning visualization with DeepSeek R1',
};