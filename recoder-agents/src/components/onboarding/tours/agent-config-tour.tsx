'use client';

import { FeatureTour, TourStep } from '@/components/onboarding/feature-tour';

const AGENT_CONFIG_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="instructions-tab"]',
    title: 'Agent Instructions',
    description: 'Write what your agent should do. Be specific about its role, tone, and goals.',
    position: 'bottom',
  },
  {
    target: '[data-tour="tools-tab"]',
    title: 'Agent Tools',
    description: 'Choose what capabilities your agent has — web search, code execution, file access, and more.',
    position: 'bottom',
  },
  {
    target: '[data-tour="knowledge-tab"]',
    title: 'Knowledge Base',
    description: 'Connect documents for your agent to reference during conversations.',
    position: 'bottom',
  },
  {
    target: '[data-tour="triggers-tab"]',
    title: 'Triggers',
    description: 'Set up automatic triggers to run your agent on a schedule or in response to events.',
    position: 'bottom',
  },
  {
    target: '[data-tour="versions-tab"]',
    title: 'Versions',
    description: 'Track your agent\'s version history and roll back to previous configurations.',
    position: 'bottom',
  },
];

export function AgentConfigTour() {
  return <FeatureTour tourId="agent-config" steps={AGENT_CONFIG_TOUR_STEPS} />;
}
