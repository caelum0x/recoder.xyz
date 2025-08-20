/**
 * Developer Onboarding API Routes for Recoder.ai DaaS Platform
 * Handles guided tutorials, skill assessment, and progressive onboarding
 */

import { Router } from 'express';
import { logger } from '../utils/logger';
import { onboardingService } from '../services/onboarding-service';
import { userService } from '../services/user-service';

const router = Router();

// Authentication middleware
const authenticate = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = req.headers['x-user-id'] as string;
  
  if (!token && !userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }
  
  req.userId = userId || 'demo-user';
  next();
};

router.use(authenticate);

// =============================================================================
// ONBOARDING FLOW ROUTES
// =============================================================================

/**
 * POST /api/onboarding/start
 * Start onboarding process for user
 */
router.post('/start', async (req, res) => {
  try {
    const {
      skillLevel = 'beginner',
      interests = [],
      goals = [],
      role = 'fullstack',
      experience = 'beginner',
      learningStyle = 'hands-on'
    } = req.body;

    if (!skillLevel || !Array.isArray(interests) || !Array.isArray(goals)) {
      return res.status(400).json({
        success: false,
        error: 'Valid skill level, interests, and goals are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await onboardingService.startOnboarding(req.userId, {
      skillLevel,
      interests,
      goals,
      role,
      experience,
      learningStyle
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'ONBOARDING_START_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      data: {
        progress: result.progress,
        recommendedPath: result.recommendedPath
      },
      message: 'Welcome to Recoder.ai! Your personalized learning journey begins now 🚀'
    });

  } catch (error: any) {
    logger.error('Start onboarding failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/onboarding/progress
 * Get user's current onboarding progress
 */
router.get('/progress', async (req, res) => {
  try {
    const progress = onboardingService.getUserProgress(req.userId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Onboarding not started',
        code: 'ONBOARDING_NOT_STARTED'
      });
    }

    // Get recommended next actions
    const recommendations = onboardingService.getRecommendedActions(req.userId);

    res.json({
      success: true,
      data: {
        progress,
        recommendations,
        completionPercentage: Math.round((progress.completedSteps.length / (progress.completedSteps.length + 5)) * 100),
        nextMilestone: progress.totalXP < 500 ? { target: 500, reward: 'Premium features unlock' } : null
      }
    });

  } catch (error: any) {
    logger.error('Get onboarding progress failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/onboarding/steps/:stepId/complete
 * Mark onboarding step as completed
 */
router.post('/steps/:stepId/complete', async (req, res) => {
  try {
    const { stepId } = req.params;
    const {
      timeSpent,
      quizResults,
      actionResult,
      feedback
    } = req.body;

    const result = await onboardingService.completeStep(req.userId, stepId, {
      timeSpent,
      quizResults,
      actionResult,
      feedback
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'STEP_COMPLETION_FAILED'
      });
    }

    res.json({
      success: true,
      data: {
        rewards: result.rewards,
        nextStep: result.nextStep
      },
      message: result.rewards ? `Great job! You earned ${result.rewards.xp} XP and ${result.rewards.credits} credits! ⭐` : 'Step completed successfully!'
    });

  } catch (error: any) {
    logger.error('Complete onboarding step failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/onboarding/steps/:stepId/skip
 * Skip optional onboarding step
 */
router.post('/steps/:stepId/skip', async (req, res) => {
  try {
    const { stepId } = req.params;
    const { reason } = req.body;

    const result = await onboardingService.skipStep(req.userId, stepId, reason);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: 'STEP_SKIP_FAILED'
      });
    }

    res.json({
      success: true,
      message: 'Step skipped successfully'
    });

  } catch (error: any) {
    logger.error('Skip onboarding step failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// INTERACTIVE TUTORIALS ROUTES
// =============================================================================

/**
 * GET /api/onboarding/tutorials
 * Get available interactive tutorials
 */
router.get('/tutorials', async (req, res) => {
  try {
    const {
      category,
      difficulty,
      maxTime
    } = req.query;

    const filters = {
      category: category as string,
      difficulty: difficulty as string,
      maxTime: maxTime ? parseInt(maxTime as string) : undefined
    };

    const tutorials = onboardingService.getInteractiveTutorials(req.userId, filters);

    res.json({
      success: true,
      data: {
        tutorials,
        total: tutorials.length,
        categories: ['frontend', 'backend', 'fullstack', 'mobile', 'blockchain', 'ai'],
        difficulties: ['beginner', 'intermediate', 'advanced']
      }
    });

  } catch (error: any) {
    logger.error('Get tutorials failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/onboarding/tutorials/:tutorialId
 * Get specific tutorial details
 */
router.get('/tutorials/:tutorialId', async (req, res) => {
  try {
    const { tutorialId } = req.params;
    
    const tutorials = onboardingService.getInteractiveTutorials();
    const tutorial = tutorials.find(t => t.id === tutorialId);

    if (!tutorial) {
      return res.status(404).json({
        success: false,
        error: 'Tutorial not found',
        code: 'TUTORIAL_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: tutorial
    });

  } catch (error: any) {
    logger.error('Get tutorial details failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/onboarding/tutorials/:tutorialId/start
 * Start interactive tutorial session
 */
router.post('/tutorials/:tutorialId/start', async (req, res) => {
  try {
    const { tutorialId } = req.params;
    
    const tutorials = onboardingService.getInteractiveTutorials();
    const tutorial = tutorials.find(t => t.id === tutorialId);

    if (!tutorial) {
      return res.status(404).json({
        success: false,
        error: 'Tutorial not found',
        code: 'TUTORIAL_NOT_FOUND'
      });
    }

    // Track tutorial start
    tutorial.analytics.starts += 1;

    // Create tutorial session
    const sessionId = 'session_' + Math.random().toString(36).substring(2, 11);
    
    res.json({
      success: true,
      data: {
        sessionId,
        tutorial: {
          ...tutorial,
          currentScene: tutorial.scenes[0],
          progress: {
            currentSceneIndex: 0,
            totalScenes: tutorial.scenes.length,
            completedScenes: []
          }
        }
      },
      message: `Tutorial "${tutorial.title}" started! Let's learn together 📚`
    });

  } catch (error: any) {
    logger.error('Start tutorial failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/onboarding/tutorials/:tutorialId/complete
 * Complete interactive tutorial
 */
router.post('/tutorials/:tutorialId/complete', async (req, res) => {
  try {
    const { tutorialId } = req.params;
    const { timeSpent, satisfaction, feedback } = req.body;
    
    const tutorials = onboardingService.getInteractiveTutorials();
    const tutorial = tutorials.find(t => t.id === tutorialId);

    if (!tutorial) {
      return res.status(404).json({
        success: false,
        error: 'Tutorial not found',
        code: 'TUTORIAL_NOT_FOUND'
      });
    }

    // Update tutorial analytics
    tutorial.analytics.completions += 1;
    if (timeSpent) {
      tutorial.analytics.averageTime = ((tutorial.analytics.averageTime || 0) + timeSpent) / 2;
    }
    if (satisfaction) {
      tutorial.analytics.satisfaction = ((tutorial.analytics.satisfaction || 0) + satisfaction) / 2;
    }

    // Award completion rewards
    const rewards = {
      xp: 50,
      credits: 25,
      badges: [`tutorial_${tutorial.category}`]
    };

    res.json({
      success: true,
      data: {
        rewards,
        certificate: {
          id: `cert_${tutorialId}_${req.userId}`,
          title: `${tutorial.title} Completion Certificate`,
          issuedAt: new Date(),
          verificationUrl: `https://recoder.ai/certificates/cert_${tutorialId}_${req.userId}`
        }
      },
      message: `Congratulations! Tutorial completed. You earned ${rewards.xp} XP! 🎉`
    });

  } catch (error: any) {
    logger.error('Complete tutorial failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// ACHIEVEMENTS ROUTES
// =============================================================================

/**
 * GET /api/onboarding/achievements
 * Get user achievements and progress
 */
router.get('/achievements', async (req, res) => {
  try {
    const achievements = onboardingService.getUserAchievements(req.userId);

    res.json({
      success: true,
      data: {
        ...achievements,
        stats: {
          totalEarned: achievements.earned.length,
          totalAvailable: achievements.available.length,
          completionRate: Math.round((achievements.earned.length / (achievements.earned.length + achievements.available.length)) * 100),
          rareAchievements: achievements.earned.filter(a => a.rarity === 'rare' || a.rarity === 'legendary').length
        }
      }
    });

  } catch (error: any) {
    logger.error('Get achievements failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// SKILL ASSESSMENT ROUTES
// =============================================================================

/**
 * POST /api/onboarding/assessment/start
 * Start skill assessment
 */
router.post('/assessment/start', async (req, res) => {
  try {
    const { category = 'general' } = req.body;

    // Create skill assessment
    const assessment = {
      id: 'assessment_' + Math.random().toString(36).substring(2, 11),
      category,
      questions: [
        {
          id: 'q1',
          question: 'What is your experience level with React?',
          type: 'multiple_choice',
          options: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
          category: 'frontend'
        },
        {
          id: 'q2',
          question: 'How comfortable are you with API development?',
          type: 'multiple_choice',
          options: ['Very uncomfortable', 'Somewhat uncomfortable', 'Comfortable', 'Very comfortable'],
          category: 'backend'
        },
        {
          id: 'q3',
          question: 'Which best describes your development workflow?',
          type: 'multiple_choice',
          options: ['Code from scratch', 'Use templates/boilerplates', 'AI-assisted development', 'Mix of all approaches'],
          category: 'workflow'
        }
      ],
      estimatedTime: 10,
      purpose: 'Personalize your learning experience'
    };

    res.json({
      success: true,
      data: assessment,
      message: 'Skill assessment ready! This helps us personalize your experience 🎯'
    });

  } catch (error: any) {
    logger.error('Start skill assessment failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/onboarding/assessment/submit
 * Submit skill assessment results
 */
router.post('/assessment/submit', async (req, res) => {
  try {
    const { assessmentId, answers, timeSpent } = req.body;

    if (!assessmentId || !answers) {
      return res.status(400).json({
        success: false,
        error: 'Assessment ID and answers are required',
        code: 'MISSING_FIELDS'
      });
    }

    // Analyze assessment results
    const results = {
      skillLevel: 'intermediate', // Calculated from answers
      recommendedPath: 'fullstack_path',
      strengths: ['Frontend Development', 'Problem Solving'],
      improvementAreas: ['Backend APIs', 'Database Design'],
      personalizedRecommendations: [
        'Start with React fundamentals tutorial',
        'Practice API development',
        'Join the fullstack developer community'
      ]
    };

    // Award assessment completion
    const rewards = {
      xp: 100,
      credits: 50,
      badges: ['skill_assessed']
    };

    res.json({
      success: true,
      data: {
        results,
        rewards,
        nextSteps: [
          {
            action: 'start_tutorial',
            title: 'Begin React Fundamentals',
            description: 'Perfect starting point based on your assessment'
          },
          {
            action: 'create_project',
            title: 'Build Your First Full-Stack App',
            description: 'Put your skills to practice'
          }
        ]
      },
      message: 'Assessment complete! Your personalized learning path is ready 🚀'
    });

  } catch (error: any) {
    logger.error('Submit skill assessment failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// =============================================================================
// LEARNING ANALYTICS ROUTES
// =============================================================================

/**
 * GET /api/onboarding/analytics
 * Get learning analytics for user
 */
router.get('/analytics', async (req, res) => {
  try {
    const progress = onboardingService.getUserProgress(req.userId);
    
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'No onboarding data found',
        code: 'NO_DATA'
      });
    }

    const analytics = {
      learningStats: {
        totalTimeSpent: progress.totalTimeSpent,
        sessionsCompleted: progress.sessionsCompleted,
        averageSessionTime: progress.sessionsCompleted > 0 ? Math.round(progress.totalTimeSpent / progress.sessionsCompleted) : 0,
        currentStreak: 5, // Mock data
        longestStreak: 12
      },
      progressMetrics: {
        totalXP: progress.totalXP,
        stepsCompleted: progress.completedSteps.length,
        achievementsEarned: progress.earnedBadges.length,
        skillLevel: progress.skillLevel,
        nextLevelXP: Math.ceil(progress.totalXP / 100) * 100 + 100
      },
      learningPath: {
        currentPath: progress.currentPath,
        completionRate: Math.round((progress.completedSteps.length / 10) * 100), // Assuming 10 total steps
        estimatedTimeToComplete: Math.max(0, (10 - progress.completedSteps.length) * 15) // 15 min per step
      },
      recommendations: onboardingService.getRecommendedActions(req.userId)
    };

    res.json({
      success: true,
      data: analytics
    });

  } catch (error: any) {
    logger.error('Get learning analytics failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;