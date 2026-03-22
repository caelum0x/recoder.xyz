'use client';

import { FeatureTour, TourStep } from '@/components/onboarding/feature-tour';

const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar-agents"]',
    title: 'Your AI Agents',
    description: 'Your AI agents live here. Create one to get started with automated tasks.',
    position: 'right',
  },
  {
    target: '[data-tour="new-agent-button"]',
    title: 'Create an Agent',
    description: 'Click here to create your first agent. Choose from templates or build from scratch.',
    position: 'bottom',
  },
  {
    target: '[data-tour="knowledge-link"]',
    title: 'Knowledge Base',
    description: 'Upload documents for your agents to reference during conversations.',
    position: 'right',
  },
  {
    target: '[data-tour="global-search"]',
    title: 'Quick Search',
    description: 'Press Cmd+K to search across everything — agents, threads, workflows, and more.',
    position: 'bottom',
  },
];

interface DashboardTourProps {
  agentCount?: number;
}

export function DashboardTour({ agentCount = 0 }: DashboardTourProps) {
  // Only show if user has fewer than 2 agents (likely new user)
  if (agentCount >= 2) return null;

  return <FeatureTour tourId="dashboard" steps={DASHBOARD_TOUR_STEPS} />;
}
