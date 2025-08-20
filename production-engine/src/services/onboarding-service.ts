/**
 * Developer Onboarding and Tutorial Service for Recoder.ai DaaS Platform
 * Handles guided tutorials, skill assessment, and progressive onboarding
 */

import { logger } from '../utils/logger';
import { userService } from './user-service';
import { projectService } from './project-service';
import { viralGrowthService } from './viral-growth-service';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  type: 'tutorial' | 'action' | 'quiz' | 'project' | 'social';
  category: 'setup' | 'basics' | 'advanced' | 'social' | 'monetization';
  
  // Step configuration
  estimatedTime: number; // minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isOptional: boolean;
  prerequisites: string[]; // step IDs
  
  // Tutorial content
  content?: {
    instructions: string[];
    videoUrl?: string;
    codeExample?: string;
    interactiveDemo?: string;
    tips: string[];
  };
  
  // Action requirements
  action?: {
    type: 'create_project' | 'share_project' | 'join_team' | 'connect_git' | 'complete_profile';
    parameters?: Record<string, any>;
    validation?: string;
  };
  
  // Quiz content
  quiz?: {
    questions: Array<{
      id: string;
      question: string;
      type: 'multiple_choice' | 'code' | 'true_false';
      options?: string[];
      correctAnswer: string | string[];
      explanation: string;
    }>;
    passingScore: number;
  };
  
  // Rewards
  rewards: {
    xp: number;
    credits: number;
    badges?: string[];
    unlocks?: string[]; // feature IDs or step IDs
  };
  
  // Analytics
  analytics: {
    startedCount: number;
    completedCount: number;
    averageTime: number;
    completionRate: number;
    commonMistakes: string[];
  };
}

export interface OnboardingPath {
  id: string;
  name: string;
  description: string;
  targetAudience: 'beginner' | 'experienced' | 'enterprise' | 'student';
  
  // Path structure
  steps: string[]; // step IDs in order
  estimatedDuration: number; // total minutes
  
  // Personalization
  skillRequirements?: string[];
  roleBasedCustomization?: {
    'frontend': string[];
    'backend': string[];
    'fullstack': string[];
    'mobile': string[];
    'devops': string[];
  };
  
  // Path rewards
  completionRewards: {
    xp: number;
    credits: number;
    certificationId?: string;
    specialBadges: string[];
    premiumAccess?: number; // days
  };
  
  analytics: {
    enrolledUsers: number;
    completedUsers: number;
    averageCompletionTime: number;
    dropOffPoints: Array<{ stepId: string; dropOffRate: number }>;
  };
}

export interface UserOnboardingProgress {
  userId: string;
  currentPath?: string;
  
  // Progress tracking
  completedSteps: string[];
  currentStep?: string;
  skippedSteps: string[];
  
  // Personalization data
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  interests: string[];
  goals: string[];
  role: string;
  experience: string;
  
  // Progress metrics
  totalXP: number;
  earnedBadges: string[];
  unlockedFeatures: string[];
  
  // Learning preferences
  preferredLearningStyle: 'visual' | 'hands-on' | 'reading' | 'video';
  pace: 'fast' | 'normal' | 'slow';
  
  // Session tracking
  sessionsCompleted: number;
  totalTimeSpent: number; // minutes
  lastActiveAt: Date;
  
  startedAt: Date;
  updatedAt: Date;
}

export interface InteractiveTutorial {
  id: string;
  title: string;
  description: string;
  category: string;
  
  // Tutorial structure
  scenes: Array<{
    id: string;
    title: string;
    type: 'explanation' | 'interaction' | 'code_editor' | 'result_preview';
    content: string;
    code?: string;
    expectedOutput?: string;
    hints?: string[];
    validation?: string;
  }>;
  
  // Interactivity
  allowsExperimentation: boolean;
  hasCodeEditor: boolean;
  hasLivePreview: boolean;
  
  // Completion criteria
  completionCriteria: {
    mustCompleteAllScenes: boolean;
    minimumScore?: number;
    requiredInteractions: string[];
  };
  
  // Metadata
  difficulty: string;
  estimatedTime: number;
  prerequisites: string[];
  tags: string[];
  
  analytics: {
    starts: number;
    completions: number;
    averageTime: number;
    satisfaction: number;
  };
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'onboarding' | 'project' | 'social' | 'learning' | 'milestone';
  
  // Requirements
  criteria: {
    type: 'steps_completed' | 'projects_created' | 'time_spent' | 'social_activity' | 'skills_mastered';
    target: number;
    parameters?: Record<string, any>;
  };
  
  // Rewards
  rewards: {
    xp: number;
    credits: number;
    specialFeatures?: string[];
    profileBadge: boolean;
  };
  
  // Rarity and visibility
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  isPublic: boolean;
  isSecret: boolean;
  
  // Analytics
  totalEarned: number;
  earnedThisWeek: number;
}

export class OnboardingService {
  private onboardingSteps: Map<string, OnboardingStep> = new Map();
  private onboardingPaths: Map<string, OnboardingPath> = new Map();
  private userProgress: Map<string, UserOnboardingProgress> = new Map();
  private interactiveTutorials: Map<string, InteractiveTutorial> = new Map();
  private achievements: Map<string, Achievement> = new Map();
  private userAchievements: Map<string, string[]> = new Map(); // userId -> achievementIds

  constructor() {
    this.initializeOnboardingService();
  }

  private initializeOnboardingService(): void {
    logger.info('🎓 Initializing Developer Onboarding Service...');
    
    // Initialize default onboarding content
    this.initializeOnboardingSteps();
    this.initializeOnboardingPaths();
    this.initializeInteractiveTutorials();
    this.initializeAchievements();
    
    logger.info('✅ Developer Onboarding Service initialized');
  }

  /**
   * Start onboarding for a new user
   */
  async startOnboarding(
    userId: string,
    preferences: {
      skillLevel: 'beginner' | 'intermediate' | 'advanced';
      interests: string[];
      goals: string[];
      role: string;
      experience: string;
      learningStyle: 'visual' | 'hands-on' | 'reading' | 'video';
    }
  ): Promise<{ success: boolean; progress?: UserOnboardingProgress; recommendedPath?: OnboardingPath; error?: string }> {
    try {
      const user = userService.getUserProfile(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Determine recommended onboarding path
      const recommendedPath = this.determineOptimalPath(preferences);
      
      // Initialize user progress
      const progress: UserOnboardingProgress = {
        userId,
        currentPath: recommendedPath.id,
        completedSteps: [],
        skippedSteps: [],
        skillLevel: preferences.skillLevel,
        interests: preferences.interests,
        goals: preferences.goals,
        role: preferences.role,
        experience: preferences.experience,
        totalXP: 0,
        earnedBadges: [],
        unlockedFeatures: ['basic_generation'],
        preferredLearningStyle: preferences.learningStyle,
        pace: 'normal',
        sessionsCompleted: 0,
        totalTimeSpent: 0,
        lastActiveAt: new Date(),
        startedAt: new Date(),
        updatedAt: new Date()
      };

      // Set current step to first step of path
      if (recommendedPath.steps.length > 0) {
        progress.currentStep = recommendedPath.steps[0];
      }

      this.userProgress.set(userId, progress);

      // Create referral code as part of onboarding
      await viralGrowthService.createUserReferralCode(userId);

      // Track onboarding start
      recommendedPath.analytics.enrolledUsers += 1;

      logger.info(`🎓 Onboarding started for ${user.username}: ${recommendedPath.name}`);

      return { success: true, progress, recommendedPath };

    } catch (error: any) {
      logger.error('Start onboarding failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Complete onboarding step
   */
  async completeStep(
    userId: string,
    stepId: string,
    completionData?: {
      timeSpent: number;
      quizResults?: Record<string, any>;
      actionResult?: Record<string, any>;
      feedback?: string;
    }
  ): Promise<{ success: boolean; rewards?: any; nextStep?: OnboardingStep; error?: string }> {
    try {
      const progress = this.userProgress.get(userId);
      if (!progress) {
        return { success: false, error: 'User onboarding not started' };
      }

      const step = this.onboardingSteps.get(stepId);
      if (!step) {
        return { success: false, error: 'Step not found' };
      }

      // Check if step is already completed
      if (progress.completedSteps.includes(stepId)) {
        return { success: false, error: 'Step already completed' };
      }

      // Validate prerequisites
      const unmetPrereqs = step.prerequisites.filter(prereq => 
        !progress.completedSteps.includes(prereq)
      );
      if (unmetPrereqs.length > 0) {
        return { success: false, error: `Prerequisites not met: ${unmetPrereqs.join(', ')}` };
      }

      // Validate step completion based on type
      const validationResult = await this.validateStepCompletion(step, completionData);
      if (!validationResult.valid) {
        return { success: false, error: validationResult.error };
      }

      // Mark step as completed
      progress.completedSteps.push(stepId);
      
      // Update user stats
      progress.totalXP += step.rewards.xp;
      progress.sessionsCompleted += 1;
      progress.totalTimeSpent += completionData?.timeSpent || step.estimatedTime;
      progress.lastActiveAt = new Date();
      progress.updatedAt = new Date();

      // Award credits and badges
      if (step.rewards.badges) {
        progress.earnedBadges.push(...step.rewards.badges);
      }
      if (step.rewards.unlocks) {
        progress.unlockedFeatures.push(...step.rewards.unlocks);
      }

      // Update step analytics
      step.analytics.completedCount += 1;
      step.analytics.completionRate = (step.analytics.completedCount / Math.max(step.analytics.startedCount, 1)) * 100;
      if (completionData?.timeSpent) {
        step.analytics.averageTime = ((step.analytics.averageTime || 0) + completionData.timeSpent) / 2;
      }

      // Determine next step
      let nextStep: OnboardingStep | undefined;
      if (progress.currentPath) {
        const path = this.onboardingPaths.get(progress.currentPath);
        if (path) {
          const currentIndex = path.steps.indexOf(stepId);
          if (currentIndex >= 0 && currentIndex < path.steps.length - 1) {
            const nextStepId = path.steps[currentIndex + 1];
            nextStep = this.onboardingSteps.get(nextStepId);
            progress.currentStep = nextStepId;
          } else {
            // Path completed
            await this.completeOnboardingPath(userId, path.id);
            progress.currentStep = undefined;
          }
        }
      }

      // Check for achievements
      await this.checkAchievements(userId);

      logger.info(`✅ Step completed: ${step.title} by user ${userId}`);

      return { 
        success: true, 
        rewards: step.rewards,
        nextStep
      };

    } catch (error: any) {
      logger.error('Complete step failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's onboarding progress
   */
  getUserProgress(userId: string): UserOnboardingProgress | null {
    return this.userProgress.get(userId) || null;
  }

  /**
   * Get recommended next actions for user
   */
  getRecommendedActions(userId: string): Array<{
    type: 'step' | 'tutorial' | 'project' | 'social';
    id: string;
    title: string;
    description: string;
    estimatedTime: number;
    priority: 'high' | 'medium' | 'low';
    rewards: any;
  }> {
    const progress = this.userProgress.get(userId);
    if (!progress) return [];

    const recommendations = [];

    // Current step recommendation
    if (progress.currentStep) {
      const step = this.onboardingSteps.get(progress.currentStep);
      if (step) {
        recommendations.push({
          type: 'step' as const,
          id: step.id,
          title: step.title,
          description: step.description,
          estimatedTime: step.estimatedTime,
          priority: 'high' as const,
          rewards: step.rewards
        });
      }
    }

    // Tutorial recommendations based on interests
    const relevantTutorials = Array.from(this.interactiveTutorials.values())
      .filter(tutorial => 
        progress.interests.some(interest => 
          tutorial.tags.includes(interest.toLowerCase())
        )
      )
      .slice(0, 3);

    relevantTutorials.forEach(tutorial => {
      recommendations.push({
        type: 'tutorial' as const,
        id: tutorial.id,
        title: tutorial.title,
        description: tutorial.description,
        estimatedTime: tutorial.estimatedTime,
        priority: 'medium' as const,
        rewards: { xp: 25, credits: 10 }
      });
    });

    return recommendations;
  }

  /**
   * Get available interactive tutorials
   */
  getInteractiveTutorials(
    userId?: string,
    filters?: {
      category?: string;
      difficulty?: string;
      maxTime?: number;
    }
  ): InteractiveTutorial[] {
    let tutorials = Array.from(this.interactiveTutorials.values());

    // Apply filters
    if (filters) {
      if (filters.category) {
        tutorials = tutorials.filter(t => t.category === filters.category);
      }
      if (filters.difficulty) {
        tutorials = tutorials.filter(t => t.difficulty === filters.difficulty);
      }
      if (filters.maxTime) {
        tutorials = tutorials.filter(t => t.estimatedTime <= filters.maxTime);
      }
    }

    // Personalize based on user progress
    if (userId) {
      const progress = this.userProgress.get(userId);
      if (progress) {
        // Filter by skill level and interests
        tutorials = tutorials.filter(tutorial =>
          progress.interests.some(interest => 
            tutorial.tags.includes(interest.toLowerCase())
          ) || tutorial.difficulty === progress.skillLevel
        );
      }
    }

    return tutorials.sort((a, b) => b.analytics.satisfaction - a.analytics.satisfaction);
  }

  /**
   * Get user achievements
   */
  getUserAchievements(userId: string): {
    earned: Achievement[];
    available: Achievement[];
    progress: Array<{ achievement: Achievement; progress: number; target: number }>;
  } {
    const earnedIds = this.userAchievements.get(userId) || [];
    const earned = earnedIds.map(id => this.achievements.get(id)!).filter(Boolean);
    
    const allAchievements = Array.from(this.achievements.values());
    const available = allAchievements.filter(a => 
      !earnedIds.includes(a.id) && !a.isSecret
    );

    // Calculate progress for available achievements
    const progress = available.map(achievement => ({
      achievement,
      progress: this.calculateAchievementProgress(userId, achievement),
      target: achievement.criteria.target
    }));

    return { earned, available, progress };
  }

  /**
   * Skip onboarding step
   */
  async skipStep(userId: string, stepId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const progress = this.userProgress.get(userId);
      if (!progress) {
        return { success: false, error: 'User onboarding not started' };
      }

      const step = this.onboardingSteps.get(stepId);
      if (!step) {
        return { success: false, error: 'Step not found' };
      }

      if (!step.isOptional) {
        return { success: false, error: 'Cannot skip required step' };
      }

      progress.skippedSteps.push(stepId);
      progress.updatedAt = new Date();

      // Move to next step if this was the current step
      if (progress.currentStep === stepId && progress.currentPath) {
        const path = this.onboardingPaths.get(progress.currentPath);
        if (path) {
          const currentIndex = path.steps.indexOf(stepId);
          if (currentIndex >= 0 && currentIndex < path.steps.length - 1) {
            progress.currentStep = path.steps[currentIndex + 1];
          }
        }
      }

      logger.info(`⏭️ Step skipped: ${step.title} by user ${userId} (${reason || 'no reason'})`);

      return { success: true };

    } catch (error: any) {
      logger.error('Skip step failed:', error);
      return { success: false, error: error.message };
    }
  }

  private determineOptimalPath(preferences: any): OnboardingPath {
    const paths = Array.from(this.onboardingPaths.values());
    
    // Score paths based on user preferences
    const scoredPaths = paths.map(path => {
      let score = 0;
      
      // Match target audience
      if (path.targetAudience === preferences.skillLevel) {
        score += 10;
      }
      
      // Match role-based customization
      if (path.roleBasedCustomization && path.roleBasedCustomization[preferences.role]) {
        score += 8;
      }
      
      // Match interests (count overlapping interests)
      const pathTags = path.steps.map(stepId => {
        const step = this.onboardingSteps.get(stepId);
        return step?.category || '';
      });
      const interestMatches = preferences.interests.filter((interest: string) => 
        pathTags.some(tag => tag.includes(interest.toLowerCase()))
      ).length;
      score += interestMatches * 3;

      return { path, score };
    });

    // Return highest scoring path
    const bestPath = scoredPaths.sort((a, b) => b.score - a.score)[0];
    return bestPath.path;
  }

  private async validateStepCompletion(step: OnboardingStep, completionData?: any): Promise<{ valid: boolean; error?: string }> {
    switch (step.type) {
      case 'action':
        if (step.action) {
          // Validate specific action was performed
          return await this.validateAction(step.action, completionData?.actionResult);
        }
        break;
      
      case 'quiz':
        if (step.quiz && completionData?.quizResults) {
          return this.validateQuiz(step.quiz, completionData.quizResults);
        }
        break;
      
      case 'project':
        // Validate project was created
        if (completionData?.actionResult?.projectId) {
          return { valid: true };
        }
        return { valid: false, error: 'Project creation required' };
      
      default:
        return { valid: true }; // Tutorial and other steps are considered complete by viewing
    }
    
    return { valid: true };
  }

  private async validateAction(action: any, result?: any): Promise<{ valid: boolean; error?: string }> {
    switch (action.type) {
      case 'create_project':
        return result?.projectId ? { valid: true } : { valid: false, error: 'Project not created' };
      
      case 'complete_profile':
        return result?.profileComplete ? { valid: true } : { valid: false, error: 'Profile not complete' };
      
      case 'connect_git':
        return result?.gitConnected ? { valid: true } : { valid: false, error: 'Git not connected' };
      
      default:
        return { valid: true };
    }
  }

  private validateQuiz(quiz: any, results: any): { valid: boolean; error?: string } {
    let correctAnswers = 0;
    const totalQuestions = quiz.questions.length;
    
    quiz.questions.forEach((question: any) => {
      const userAnswer = results[question.id];
      if (Array.isArray(question.correctAnswer)) {
        if (Array.isArray(userAnswer) && 
            userAnswer.length === question.correctAnswer.length &&
            userAnswer.every((ans: string) => question.correctAnswer.includes(ans))) {
          correctAnswers++;
        }
      } else if (userAnswer === question.correctAnswer) {
        correctAnswers++;
      }
    });

    const score = (correctAnswers / totalQuestions) * 100;
    
    return score >= quiz.passingScore ? 
      { valid: true } : 
      { valid: false, error: `Quiz score ${score}% below passing score ${quiz.passingScore}%` };
  }

  private async completeOnboardingPath(userId: string, pathId: string): Promise<void> {
    const path = this.onboardingPaths.get(pathId);
    const progress = this.userProgress.get(userId);
    
    if (path && progress) {
      // Award path completion rewards
      progress.totalXP += path.completionRewards.xp;
      progress.earnedBadges.push(...path.completionRewards.specialBadges);
      
      // Update path analytics
      path.analytics.completedUsers += 1;
      
      logger.info(`🎓 Onboarding path completed: ${path.name} by user ${userId}`);
    }
  }

  private async checkAchievements(userId: string): Promise<void> {
    const progress = this.userProgress.get(userId);
    if (!progress) return;

    const earnedIds = this.userAchievements.get(userId) || [];
    const availableAchievements = Array.from(this.achievements.values())
      .filter(a => !earnedIds.includes(a.id));

    for (const achievement of availableAchievements) {
      if (this.calculateAchievementProgress(userId, achievement) >= achievement.criteria.target) {
        earnedIds.push(achievement.id);
        progress.earnedBadges.push(achievement.id);
        progress.totalXP += achievement.rewards.xp;
        
        achievement.totalEarned += 1;
        achievement.earnedThisWeek += 1;
        
        logger.info(`🏆 Achievement earned: ${achievement.name} by user ${userId}`);
      }
    }

    this.userAchievements.set(userId, earnedIds);
  }

  private calculateAchievementProgress(userId: string, achievement: Achievement): number {
    const progress = this.userProgress.get(userId);
    if (!progress) return 0;

    switch (achievement.criteria.type) {
      case 'steps_completed':
        return progress.completedSteps.length;
      
      case 'time_spent':
        return progress.totalTimeSpent;
      
      case 'projects_created':
        const userProjects = projectService.getUserProjects(userId);
        return userProjects.total;
      
      default:
        return 0;
    }
  }

  private initializeOnboardingSteps(): void {
    const steps: Partial<OnboardingStep>[] = [
      {
        id: 'welcome',
        title: 'Welcome to Recoder.ai',
        description: 'Get started with AI-powered code generation',
        type: 'tutorial',
        category: 'setup',
        estimatedTime: 5,
        difficulty: 'beginner',
        isOptional: false,
        prerequisites: [],
        content: {
          instructions: [
            'Welcome to Recoder.ai, the future of software development!',
            'This platform uses advanced AI to generate production-ready code in minutes.',
            'Let\'s get you started with your first project.'
          ],
          tips: [
            'Take your time to explore',
            'Don\'t hesitate to ask for help',
            'Every expert was once a beginner'
          ]
        },
        rewards: { xp: 10, credits: 25, badges: ['newcomer'] }
      },
      {
        id: 'complete_profile',
        title: 'Complete Your Profile',
        description: 'Tell us about your development experience',
        type: 'action',
        category: 'setup',
        estimatedTime: 10,
        difficulty: 'beginner',
        isOptional: false,
        prerequisites: ['welcome'],
        action: {
          type: 'complete_profile',
          validation: 'profile_complete'
        },
        rewards: { xp: 25, credits: 50 }
      },
      {
        id: 'first_project',
        title: 'Create Your First Project',
        description: 'Generate your first AI-powered application',
        type: 'project',
        category: 'basics',
        estimatedTime: 15,
        difficulty: 'beginner',
        isOptional: false,
        prerequisites: ['complete_profile'],
        content: {
          instructions: [
            'Click "New Project" to start',
            'Choose a simple web application',
            'Describe what you want to build',
            'Watch the AI generate your code!'
          ],
          tips: [
            'Be specific in your description',
            'Start with something simple',
            'You can always iterate and improve'
          ]
        },
        rewards: { xp: 100, credits: 100, badges: ['first_project'], unlocks: ['advanced_features'] }
      }
    ];

    steps.forEach((stepData, index) => {
      const step: OnboardingStep = {
        ...stepData,
        analytics: {
          startedCount: 0,
          completedCount: 0,
          averageTime: stepData.estimatedTime || 0,
          completionRate: 0,
          commonMistakes: []
        }
      } as OnboardingStep;
      
      this.onboardingSteps.set(step.id, step);
    });

    logger.info(`📚 Initialized ${steps.length} onboarding steps`);
  }

  private initializeOnboardingPaths(): void {
    const paths: Partial<OnboardingPath>[] = [
      {
        id: 'beginner_path',
        name: 'Beginner Developer Journey',
        description: 'Perfect for developers new to AI-assisted development',
        targetAudience: 'beginner',
        steps: ['welcome', 'complete_profile', 'first_project'],
        estimatedDuration: 30,
        completionRewards: {
          xp: 200,
          credits: 200,
          specialBadges: ['graduate_beginner'],
          premiumAccess: 7
        }
      }
    ];

    paths.forEach(pathData => {
      const path: OnboardingPath = {
        ...pathData,
        analytics: {
          enrolledUsers: 0,
          completedUsers: 0,
          averageCompletionTime: pathData.estimatedDuration || 0,
          dropOffPoints: []
        }
      } as OnboardingPath;
      
      this.onboardingPaths.set(path.id, path);
    });

    logger.info(`🛤️ Initialized ${paths.length} onboarding paths`);
  }

  private initializeInteractiveTutorials(): void {
    const tutorials: Partial<InteractiveTutorial>[] = [
      {
        id: 'react_basics',
        title: 'React Fundamentals with AI',
        description: 'Learn React basics while AI helps you code',
        category: 'frontend',
        difficulty: 'beginner',
        estimatedTime: 20,
        tags: ['react', 'frontend', 'javascript'],
        scenes: [
          {
            id: 'intro',
            title: 'What is React?',
            type: 'explanation',
            content: 'React is a JavaScript library for building user interfaces...'
          },
          {
            id: 'first_component',
            title: 'Create Your First Component',
            type: 'code_editor',
            content: 'Let\'s create a simple React component',
            code: 'function Welcome() {\n  return <h1>Hello, World!</h1>;\n}',
            expectedOutput: '<h1>Hello, World!</h1>'
          }
        ],
        allowsExperimentation: true,
        hasCodeEditor: true,
        hasLivePreview: true,
        completionCriteria: {
          mustCompleteAllScenes: true,
          requiredInteractions: ['code_editor', 'live_preview']
        }
      }
    ];

    tutorials.forEach(tutorialData => {
      const tutorial: InteractiveTutorial = {
        ...tutorialData,
        prerequisites: tutorialData.prerequisites || [],
        analytics: {
          starts: 0,
          completions: 0,
          averageTime: tutorialData.estimatedTime || 0,
          satisfaction: 4.5
        }
      } as InteractiveTutorial;
      
      this.interactiveTutorials.set(tutorial.id, tutorial);
    });

    logger.info(`🎮 Initialized ${tutorials.length} interactive tutorials`);
  }

  private initializeAchievements(): void {
    const achievements: Partial<Achievement>[] = [
      {
        id: 'first_steps',
        name: 'First Steps',
        description: 'Complete your first onboarding step',
        icon: '👶',
        category: 'onboarding',
        criteria: { type: 'steps_completed', target: 1 },
        rewards: { xp: 50, credits: 25, profileBadge: true },
        rarity: 'common',
        isPublic: true,
        isSecret: false
      },
      {
        id: 'quick_learner',
        name: 'Quick Learner',
        description: 'Complete onboarding in under 30 minutes',
        icon: '⚡',
        category: 'onboarding',
        criteria: { type: 'time_spent', target: 30 },
        rewards: { xp: 100, credits: 50, profileBadge: true },
        rarity: 'uncommon',
        isPublic: true,
        isSecret: false
      }
    ];

    achievements.forEach(achievementData => {
      const achievement: Achievement = {
        ...achievementData,
        totalEarned: 0,
        earnedThisWeek: 0
      } as Achievement;
      
      this.achievements.set(achievement.id, achievement);
    });

    logger.info(`🏆 Initialized ${achievements.length} achievements`);
  }
}

// Export singleton instance
export const onboardingService = new OnboardingService();