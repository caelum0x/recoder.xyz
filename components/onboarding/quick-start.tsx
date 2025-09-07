'use client'

import React, { useState } from 'react'
// import { motion, AnimatePresence } from 'framer-motion'
import { 
  Play, 
  Code, 
  Zap, 
  CheckCircle, 
  ArrowRight, 
  Star,
  Rocket,
  Target,
  GitBranch,
  Database
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

interface QuickStartStep {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  action: string
  href?: string
  completed?: boolean
  timeEstimate: string
}

interface QuickStartProps {
  onStepComplete?: (stepId: string) => void
  onAllComplete?: () => void
  initialCompletedSteps?: string[]
}

const quickStartSteps: QuickStartStep[] = [
  {
    id: 'create-first-project',
    title: 'Create Your First Project',
    description: 'Start building by creating a new project from our templates or from scratch.',
    icon: <Code className="w-5 h-5" />,
    action: 'Create Project',
    href: '/dashboard/projects/new',
    timeEstimate: '2 min'
  },
  {
    id: 'setup-workspace',
    title: 'Set Up Your Workspace',
    description: 'Configure your development environment and connect your tools.',
    icon: <Target className="w-5 h-5" />,
    action: 'Configure',
    href: '/dashboard/workspace',
    timeEstimate: '5 min'
  },
  {
    id: 'explore-ai-features',
    title: 'Explore AI-Powered Features',
    description: 'Discover how AI can accelerate your development workflow.',
    icon: <Zap className="w-5 h-5" />,
    action: 'Try AI Tools',
    href: '/dashboard/ai-tools',
    timeEstimate: '3 min'
  },
  {
    id: 'connect-repository',
    title: 'Connect Your Repository',
    description: 'Link your GitHub, GitLab, or other version control repositories.',
    icon: <GitBranch className="w-5 h-5" />,
    action: 'Connect Git',
    href: '/dashboard/integrations/git',
    timeEstimate: '2 min'
  },
  {
    id: 'setup-database',
    title: 'Set Up Database',
    description: 'Configure your database connections and start building with data.',
    icon: <Database className="w-5 h-5" />,
    action: 'Add Database',
    href: '/dashboard/database',
    timeEstimate: '4 min'
  }
]

export function QuickStart({ 
  onStepComplete, 
  onAllComplete, 
  initialCompletedSteps = [] 
}: QuickStartProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(
    new Set(initialCompletedSteps)
  )
  const [currentStep, setCurrentStep] = useState<string | null>(null)

  const handleStepComplete = (stepId: string) => {
    const newCompleted = new Set(completedSteps)
    newCompleted.add(stepId)
    setCompletedSteps(newCompleted)
    onStepComplete?.(stepId)

    if (newCompleted.size === quickStartSteps.length) {
      onAllComplete?.()
    }
  }

  const handleStepAction = (step: QuickStartStep) => {
    setCurrentStep(step.id)
    if (step.href) {
      window.open(step.href, '_blank')
    }
    // Simulate completion after action
    setTimeout(() => {
      handleStepComplete(step.id)
      setCurrentStep(null)
    }, 1000)
  }

  const progress = (completedSteps.size / quickStartSteps.length) * 100

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div
          className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-full text-sm font-medium animate-fade-in"
        >
          <Rocket className="w-4 h-4" />
          Quick Start Guide
        </div>
        
        <h2
          className="text-2xl font-bold text-gray-900 dark:text-white animate-fade-in-delay"
        >
          Get Started in Minutes
        </h2>
        
        <p
          className="text-gray-600 dark:text-gray-400 max-w-md mx-auto animate-fade-in-delay-2"
        >
          Follow these essential steps to unlock the full potential of Recoder.xyz
        </p>

        {/* Progress */}
        <div
          className="max-w-md mx-auto space-y-2 animate-fade-in-delay-3"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              {completedSteps.size} of {quickStartSteps.length} completed
            </span>
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Steps */}
      <div className="grid gap-4 max-w-2xl mx-auto">
        <AnimatePresence>
          {quickStartSteps.map((step, index) => {
            const isCompleted = completedSteps.has(step.id)
            const isCurrent = currentStep === step.id

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`relative transition-all duration-300 ${
                  isCompleted 
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                    : isCurrent
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-md'
                    : 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                  {/* Completion Indicator */}
                  {isCompleted && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full p-1"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </motion.div>
                  )}

                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          isCompleted 
                            ? 'bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          {step.icon}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{step.title}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {step.timeEstimate}
                            </Badge>
                            {isCompleted && (
                              <Badge variant="default" className="text-xs bg-green-500">
                                Completed
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <CardDescription className="mb-4">
                      {step.description}
                    </CardDescription>

                    <Button
                      onClick={() => handleStepAction(step)}
                      disabled={isCompleted || isCurrent}
                      className={`w-full ${
                        isCompleted 
                          ? 'bg-green-500 hover:bg-green-600' 
                          : ''
                      }`}
                      variant={isCompleted ? "default" : "outline"}
                    >
                      {isCurrent ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                        />
                      ) : isCompleted ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Completed
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          {step.action}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Completion Celebration */}
      <AnimatePresence>
        {completedSteps.size === quickStartSteps.length && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="text-center py-8"
          >
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-3 rounded-full text-lg font-semibold mb-4">
              <Star className="w-5 h-5" />
              Congratulations! 🎉
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              You're All Set!
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You've completed the quick start guide. Ready to build something amazing?
            </p>
            <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              <Rocket className="w-5 h-5 mr-2" />
              Start Building
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default QuickStart
