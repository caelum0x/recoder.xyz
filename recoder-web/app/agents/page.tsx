/**
 * Agentic Workflows Page for Recoder.xyz
 * 
 * Main page for AI agent workflows and autonomous development
 */

import AgenticWorkflowInterface from '@/components/agents/agentic-workflow-interface';

// Force dynamic rendering to avoid SSR issues with auth context
export const dynamic = 'force-dynamic';

export default function AgentsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <AgenticWorkflowInterface />
    </div>
  );
}

export const metadata = {
  title: 'AI Agents - Recoder.xyz',
  description: 'Autonomous AI workflows with Kimi K2, DeepSeek R1, and multi-model orchestration for complex development tasks',
};