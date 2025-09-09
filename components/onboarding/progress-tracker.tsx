'use client'

import React, { useState, useEffect, createContext, useContext } from 'react'
import { 
  CheckCircle, 
  Circle, 
  Trophy, 
  Star, 
  TrendingUp, 
  Target,
  Clock,
  Award,
  Gift,
  Sparkles
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

interface OnboardingStep {
  id: string
  title: string
  description: string
  category: 'setup' | 'learning' | 'usage' | 'advanced'
  points: number
  required: boolean
  completed: boolean
  completedAt?: Date
  action?: {
    text: string
    href?: string
    callback?: () => void
  }
  dependencies?: string[] // Other step IDs that must be completed first
}

interface OnboardingMilestone {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  pointsRequired: number
  reward?: {
    type: 'badge' | 'feature' | 'discount' | 'content'
    title: string
    description: string
    value?: string
  }
  unlocked: boolean
  claimed: boolean
}

interface OnboardingProgress {
  totalSteps: number
  completedSteps: number
  totalPoints: number
  earnedPoints: number
  currentStreak: number
  longestStreak: number
  level: number
  nextLevelPoints: number
  milestones: OnboardingMilestone[]
  completionPercentage: number
}

interface OnboardingContextType {
  progress: OnboardingProgress
  steps: OnboardingStep[]
  completeStep: (stepId: string) => void
  claimMilestone: (milestoneId: string) => void
  resetProgress: () => void
  getAvailableSteps: () => OnboardingStep[]
  getNextSuggestion: () => OnboardingStep | null
}

const OnboardingContext = createContext<OnboardingContextType | null>(null)

const initialSteps: OnboardingStep[] = [
  // Setup Category
  {
    id: 'complete-profile',
    title: 'Complete Your Profile',
    description: 'Add your name, avatar, and basic information',
    category: 'setup',
    points: 10,
    required: true,
    completed: false,
    action: {
      text: 'Complete Profile',
      href: '/settings/account'
    }
  },
  {
    id: 'verify-email',
    title: 'Verify Email Address',
    description: 'Confirm your email to secure your account',
    category: 'setup',
    points: 15,
    required: true,
    completed: false,
    action: {
      text: 'Verify Email',
      callback: () => console.log('Sending verification email')
    }
  },
  {
    id: 'setup-2fa',
    title: 'Enable Two-Factor Authentication',
    description: 'Secure your account with 2FA',
    category: 'setup',
    points: 25,
    required: false,
    completed: false,
    dependencies: ['verify-email'],
    action: {
      text: 'Setup 2FA',
      href: '/settings/security'
    }
  },

  // Learning Category
  {
    id: 'watch-intro-video',
    title: 'Watch Platform Introduction',
    description: 'Learn the basics of Recoder.xyz in 5 minutes',
    category: 'learning',
    points: 15,
    required: false,
    completed: false,
    action: {
      text: 'Watch Video',
      callback: () => console.log('Opening intro video')
    }
  },
  {
    id: 'complete-tutorial',
    title: 'Complete Interactive Tutorial',
    description: 'Walk through key features step-by-step',
    category: 'learning',
    points: 30,
    required: false,
    completed: false,
    dependencies: ['watch-intro-video'],
    action: {
      text: 'Start Tutorial',
      callback: () => console.log('Starting tutorial')
    }
  },
  {
    id: 'read-documentation',
    title: 'Explore Documentation',
    description: 'Browse through our comprehensive guides',
    category: 'learning',
    points: 20,
    required: false,
    completed: false,
    action: {
      text: 'View Docs',
      href: '/docs'
    }
  },

  // Usage Category
  {
    id: 'create-first-project',
    title: 'Create Your First Project',
    description: 'Set up a new project from scratch or template',
    category: 'usage',
    points: 50,
    required: true,
    completed: false,
    dependencies: ['complete-profile'],
    action: {
      text: 'New Project',
      href: '/dashboard/projects/new'
    }
  },
  {
    id: 'use-ai-assistant',
    title: 'Try AI Assistant',
    description: 'Generate code or get help using AI',
    category: 'usage',
    points: 40,
    required: false,
    completed: false,
    dependencies: ['create-first-project'],
    action: {
      text: 'Use AI',
      callback: () => console.log('Opening AI assistant')
    }
  },
  {
    id: 'deploy-project',
    title: 'Deploy Your Project',
    description: 'Make your project live on the web',
    category: 'usage',
    points: 60,
    required: false,
    completed: false,
    dependencies: ['create-first-project'],
    action: {
      text: 'Deploy Now',
      callback: () => console.log('Opening deployment')
    }
  },
  {
    id: 'invite-collaborator',
    title: 'Invite a Team Member',
    description: 'Share your project with others',
    category: 'usage',
    points: 35,
    required: false,
    completed: false,
    dependencies: ['create-first-project'],
    action: {
      text: 'Invite Member',
      href: '/settings/team'
    }
  },

  // Advanced Category
  {
    id: 'connect-github',
    title: 'Connect GitHub Account',
    description: 'Link your GitHub for seamless integration',
    category: 'advanced',
    points: 30,
    required: false,
    completed: false,
    action: {
      text: 'Connect GitHub',
      href: '/settings/integrations'
    }
  },
  {
    id: 'setup-custom-domain',
    title: 'Set Up Custom Domain',
    description: 'Use your own domain for projects',
    category: 'advanced',
    points: 45,
    required: false,
    completed: false,
    dependencies: ['deploy-project'],
    action: {
      text: 'Add Domain',
      href: '/settings/domains'
    }
  },
  {
    id: 'configure-ci-cd',
    title: 'Configure CI/CD Pipeline',
    description: 'Automate your deployment process',
    category: 'advanced',
    points: 75,
    required: false,
    completed: false,
    dependencies: ['connect-github', 'deploy-project'],
    action: {
      text: 'Setup CI/CD',
      callback: () => console.log('Opening CI/CD setup')
    }
  }
]

const milestones: OnboardingMilestone[] = [
  {
    id: 'welcome-aboard',
    title: 'Welcome Aboard!',
    description: 'Complete your first onboarding step',
    icon: <Trophy className="w-6 h-6 text-yellow-500" />,
    pointsRequired: 10,
    reward: {
      type: 'badge',
      title: 'Early Adopter',
      description: 'Joined the Recoder.xyz community'
    },
    unlocked: false,
    claimed: false
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Complete basic setup requirements',
    icon: <Star className="w-6 h-6 text-blue-500" />,
    pointsRequired: 50,
    reward: {
      type: 'feature',
      title: 'Priority Support',
      description: 'Get faster response times'
    },
    unlocked: false,
    claimed: false
  },
  {
    id: 'power-user',
    title: 'Power User',
    description: 'Explore advanced platform features',
    icon: <Sparkles className="w-6 h-6 text-purple-500" />,
    pointsRequired: 150,
    reward: {
      type: 'discount',
      title: '20% Discount',
      description: 'Off your first premium subscription',
      value: '20%'
    },
    unlocked: false,
    claimed: false
  },
  {
    id: 'platform-master',
    title: 'Platform Master',
    description: 'Complete all onboarding steps',
    icon: <Award className="w-6 h-6 text-green-500" />,
    pointsRequired: 300,
    reward: {
      type: 'content',
      title: 'Exclusive Templates',
      description: 'Access to premium project templates'
    },
    unlocked: false,
    claimed: false
  }
]

export function OnboardingProgressProvider({ children }: { children: React.ReactNode }) {
  const [steps, setSteps] = useState<OnboardingStep[]>(initialSteps)
  const [progress, setProgress] = useState<OnboardingProgress>({
    totalSteps: initialSteps.length,
    completedSteps: 0,
    totalPoints: initialSteps.reduce((sum, step) => sum + step.points, 0),
    earnedPoints: 0,
    currentStreak: 0,
    longestStreak: 0,
    level: 1,
    nextLevelPoints: 100,
    milestones: milestones,
    completionPercentage: 0
  })

  // Load progress from localStorage
  useEffect(() => {
    const savedProgress = localStorage.getItem('onboardingProgress')
    const savedSteps = localStorage.getItem('onboardingSteps')
    
    if (savedProgress) {
      setProgress(JSON.parse(savedProgress))
    }
    if (savedSteps) {
      setSteps(JSON.parse(savedSteps))
    }
  }, [])

  // Save progress to localStorage
  useEffect(() => {
    localStorage.setItem('onboardingProgress', JSON.stringify(progress))
    localStorage.setItem('onboardingSteps', JSON.stringify(steps))
  }, [progress, steps])

  // Recalculate progress when steps change
  useEffect(() => {
    const completedSteps = steps.filter(step => step.completed).length
    const earnedPoints = steps
      .filter(step => step.completed)
      .reduce((sum, step) => sum + step.points, 0)
    
    const completionPercentage = (completedSteps / steps.length) * 100
    const level = Math.floor(earnedPoints / 100) + 1
    const nextLevelPoints = level * 100

    // Update milestones
    const updatedMilestones = progress.milestones.map(milestone => ({
      ...milestone,
      unlocked: earnedPoints >= milestone.pointsRequired
    }))

    setProgress(prev => ({
      ...prev,
      completedSteps,
      earnedPoints,
      completionPercentage,
      level,
      nextLevelPoints,
      milestones: updatedMilestones
    }))
  }, [steps])

  const completeStep = (stepId: string) => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === stepId 
          ? { ...step, completed: true, completedAt: new Date() }
          : step
      )
    )

    // Update streak
    setProgress(prev => ({
      ...prev,
      currentStreak: prev.currentStreak + 1,
      longestStreak: Math.max(prev.longestStreak, prev.currentStreak + 1)
    }))
  }

  const claimMilestone = (milestoneId: string) => {
    setProgress(prev => ({
      ...prev,
      milestones: prev.milestones.map(milestone =>
        milestone.id === milestoneId
          ? { ...milestone, claimed: true }
          : milestone
      )
    }))
  }

  const resetProgress = () => {
    setSteps(initialSteps)
    setProgress({
      totalSteps: initialSteps.length,
      completedSteps: 0,
      totalPoints: initialSteps.reduce((sum, step) => sum + step.points, 0),
      earnedPoints: 0,
      currentStreak: 0,
      longestStreak: 0,
      level: 1,
      nextLevelPoints: 100,
      milestones: milestones,
      completionPercentage: 0
    })
    localStorage.removeItem('onboardingProgress')
    localStorage.removeItem('onboardingSteps')
  }

  const getAvailableSteps = () => {
    return steps.filter(step => {
      if (step.completed) return false
      if (!step.dependencies) return true
      return step.dependencies.every(depId => 
        steps.find(s => s.id === depId)?.completed
      )
    })
  }

  const getNextSuggestion = () => {
    const availableSteps = getAvailableSteps()
    
    // Prioritize required steps
    const requiredSteps = availableSteps.filter(step => step.required)
    if (requiredSteps.length > 0) {
      return requiredSteps[0]
    }
    
    // Then highest point value
    const sortedByPoints = availableSteps.sort((a, b) => b.points - a.points)
    return sortedByPoints[0] || null
  }

  const contextValue: OnboardingContextType = {
    progress,
    steps,
    completeStep,
    claimMilestone,
    resetProgress,
    getAvailableSteps,
    getNextSuggestion
  }

  return (
    <OnboardingContext.Provider value={contextValue}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboardingProgress() {
  const context = useContext(OnboardingContext)
  if (!context) {
    throw new Error('useOnboardingProgress must be used within OnboardingProgressProvider')
  }
  return context
}

export function OnboardingProgressDashboard() {
  const { progress, steps, completeStep, claimMilestone, getAvailableSteps, getNextSuggestion } = useOnboardingProgress()
  
  const availableSteps = getAvailableSteps()
  const nextSuggestion = getNextSuggestion()
  const unclaimedMilestones = progress.milestones.filter(m => m.unlocked && !m.claimed)

  const getCategoryIcon = (category: OnboardingStep['category']) => {
    switch (category) {
      case 'setup':
        return <Target className="w-4 h-4" />
      case 'learning':
        return <Star className="w-4 h-4" />
      case 'usage':
        return <TrendingUp className="w-4 h-4" />
      case 'advanced':
        return <Sparkles className="w-4 h-4" />
    }
  }

  const getCategoryColor = (category: OnboardingStep['category']) => {
    switch (category) {
      case 'setup':
        return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20'
      case 'learning':
        return 'text-green-600 bg-green-100 dark:bg-green-900/20'
      case 'usage':
        return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20'
      case 'advanced':
        return 'text-orange-600 bg-orange-100 dark:bg-orange-900/20'
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Onboarding Progress
          </CardTitle>
          <CardDescription>
            Track your journey to becoming a Recoder.xyz expert
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {progress.completedSteps}/{progress.totalSteps}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Steps Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {progress.earnedPoints}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Points Earned</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                Level {progress.level}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {progress.nextLevelPoints - progress.earnedPoints} to next level
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {progress.currentStreak}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Current Streak</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Overall Progress
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {Math.round(progress.completionPercentage)}%
              </span>
            </div>
            <Progress value={progress.completionPercentage} className="h-2" />
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Level Progress
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {progress.earnedPoints % 100}/100
              </span>
            </div>
            <Progress value={(progress.earnedPoints % 100)} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Milestones */}
      {unclaimedMilestones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-green-500" />
              Milestones Ready to Claim
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unclaimedMilestones.map((milestone) => (
                <div key={milestone.id} className="flex items-center justify-between p-4 border border-green-200 dark:border-green-800 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-center gap-3">
                    {milestone.icon}
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {milestone.title}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {milestone.description}
                      </p>
                      {milestone.reward && (
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Reward: {milestone.reward.title}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button onClick={() => claimMilestone(milestone.id)}>
                    Claim Reward
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Suggestion */}
      {nextSuggestion && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-500" />
              Suggested Next Step
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${getCategoryColor(nextSuggestion.category)}`}>
                  {getCategoryIcon(nextSuggestion.category)}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    {nextSuggestion.title}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {nextSuggestion.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={nextSuggestion.required ? 'default' : 'secondary'} className="text-xs">
                      {nextSuggestion.required ? 'Required' : 'Optional'}
                    </Badge>
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                      +{nextSuggestion.points} points
                    </span>
                  </div>
                </div>
              </div>
              {nextSuggestion.action && (
                <Button 
                  onClick={() => {
                    if (nextSuggestion.action?.callback) {
                      nextSuggestion.action.callback()
                    } else if (nextSuggestion.action?.href) {
                      window.location.href = nextSuggestion.action.href
                    }
                  }}
                >
                  {nextSuggestion.action.text}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Available Steps ({availableSteps.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {availableSteps.map((step) => (
              <div key={step.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Circle className="w-5 h-5 text-gray-400" />
                  <div className={`p-2 rounded-lg ${getCategoryColor(step.category)}`}>
                    {getCategoryIcon(step.category)}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {step.title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {step.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={step.required ? 'default' : 'secondary'} className="text-xs">
                        {step.required ? 'Required' : 'Optional'}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        +{step.points} points
                      </span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {step.category}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {step.action && (
                    <Button 
                      size="sm"
                      onClick={() => {
                        if (step.action?.callback) {
                          step.action.callback()
                        } else if (step.action?.href) {
                          window.location.href = step.action.href
                        }
                      }}
                    >
                      {step.action.text}
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => completeStep(step.id)}
                  >
                    Mark Complete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default OnboardingProgressDashboard
