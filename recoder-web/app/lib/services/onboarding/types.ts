/**
 * Onboarding Types
 * Type definitions for the onboarding and tutorial system
 */

// Step status
export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped';

// Use case selections for onboarding
export type UseCase =
  | 'web-development'
  | 'ai-prototyping'
  | 'learning'
  | 'side-project'
  | 'freelance'
  | 'startup'
  | 'other';

// Experience level
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

// Onboarding step definition
export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  order: number;
  isRequired: boolean;
  completedAt?: number;
}

// Onboarding flow configuration
export interface OnboardingFlow {
  id: string;
  name: string;
  description: string;
  steps: OnboardingStep[];
  completedSteps: string[];
  currentStepId: string | null;
  startedAt: number;
  completedAt?: number;
  isCompleted: boolean;
}

// Tutorial step with UI targeting
export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  /** CSS selector or element ID to highlight */
  targetSelector?: string;
  /** Position of the tooltip relative to target */
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Action the user should take */
  action?: {
    type: 'click' | 'type' | 'hover' | 'scroll' | 'wait' | 'custom';
    payload?: string;
  };
  /** Whether to wait for the user to complete the action */
  waitForAction?: boolean;
  /** Time to auto-advance if no action required (ms) */
  autoAdvanceDelay?: number;
  /** Optional image or video URL */
  mediaUrl?: string;
  /** Media type */
  mediaType?: 'image' | 'video' | 'gif';
  /** Order in the tutorial */
  order: number;
  /** Validation function name */
  validation?: string;
}

// Tutorial definition
export interface Tutorial {
  id: string;
  name: string;
  description: string;
  category: TutorialCategory;
  estimatedMinutes: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  steps: TutorialStep[];
  prerequisites?: string[];
  tags: string[];
  icon: string;
}

export type TutorialCategory =
  | 'getting-started'
  | 'ai-coding'
  | 'deployment'
  | 'collaboration'
  | 'advanced';

// User progress tracking
export interface UserProgress {
  userId: string;
  onboardingCompleted: boolean;
  onboardingCompletedAt?: number;
  useCase?: UseCase;
  experienceLevel?: ExperienceLevel;
  completedTutorials: string[];
  tutorialProgress: Record<string, TutorialProgress>;
  achievements: Achievement[];
  totalTimeSpent: number;
  lastActivityAt: number;
  createdAt: number;
  preferences: OnboardingPreferences;
}

// Tutorial progress
export interface TutorialProgress {
  tutorialId: string;
  currentStepIndex: number;
  completedSteps: string[];
  startedAt: number;
  completedAt?: number;
  isCompleted: boolean;
  timeSpent: number;
}

// User preferences for onboarding
export interface OnboardingPreferences {
  showTooltips: boolean;
  showWelcomeBack: boolean;
  showFeatureHighlights: boolean;
  showAchievements: boolean;
  reducedAnimations: boolean;
}

// Achievement definitions
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  unlockedAt?: number;
  progress?: number;
  maxProgress?: number;
  isSecret?: boolean;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

export type AchievementCategory =
  | 'onboarding'
  | 'coding'
  | 'ai-usage'
  | 'deployment'
  | 'collaboration'
  | 'streak'
  | 'special';

// Achievement definition (for creating new achievements)
export interface AchievementDefinition extends Omit<Achievement, 'unlockedAt'> {
  condition: AchievementCondition;
}

export interface AchievementCondition {
  type: 'count' | 'streak' | 'first' | 'cumulative' | 'custom';
  metric: string;
  threshold?: number;
  customCheck?: string;
}

// Feature highlight for new features
export interface FeatureHighlight {
  id: string;
  title: string;
  description: string;
  version: string;
  targetSelector?: string;
  dismissedAt?: number;
  releaseDate: number;
  priority: 'low' | 'medium' | 'high';
  category: string;
  learnMoreUrl?: string;
  mediaUrl?: string;
}

// Tooltip configuration
export interface TooltipConfig {
  id: string;
  content: string;
  targetSelector: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  showOnce?: boolean;
  delay?: number;
  trigger: 'hover' | 'focus' | 'manual';
  feature?: string;
}

// Onboarding event for analytics
export interface OnboardingEvent {
  type: OnboardingEventType;
  timestamp: number;
  data?: Record<string, unknown>;
}

export type OnboardingEventType =
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_step_skipped'
  | 'onboarding_completed'
  | 'tutorial_started'
  | 'tutorial_step_completed'
  | 'tutorial_completed'
  | 'tutorial_abandoned'
  | 'achievement_unlocked'
  | 'feature_highlight_viewed'
  | 'feature_highlight_dismissed'
  | 'tooltip_shown'
  | 'tooltip_dismissed';

// Wizard step for initial onboarding
export interface WizardStep {
  id: string;
  title: string;
  component: string;
  isRequired: boolean;
  canSkip: boolean;
  validation?: (data: Record<string, unknown>) => boolean;
}

// Onboarding wizard state
export interface WizardState {
  currentStep: number;
  steps: WizardStep[];
  data: Record<string, unknown>;
  isComplete: boolean;
}

// Default preferences
export const DEFAULT_ONBOARDING_PREFERENCES: OnboardingPreferences = {
  showTooltips: true,
  showWelcomeBack: true,
  showFeatureHighlights: true,
  showAchievements: true,
  reducedAnimations: false,
};

// Default user progress
export function createDefaultUserProgress(userId: string): UserProgress {
  return {
    userId,
    onboardingCompleted: false,
    completedTutorials: [],
    tutorialProgress: {},
    achievements: [],
    totalTimeSpent: 0,
    lastActivityAt: Date.now(),
    createdAt: Date.now(),
    preferences: { ...DEFAULT_ONBOARDING_PREFERENCES },
  };
}
