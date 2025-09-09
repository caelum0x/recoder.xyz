'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  HelpCircle, 
  X, 
  ChevronRight, 
  ChevronLeft,
  Star,
  Lightbulb,
  Target,
  Zap,
  CheckCircle,
  Eye,
  EyeOff
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface TooltipStep {
  id: string
  target: string // CSS selector for the target element
  title: string
  description: string
  position: 'top' | 'bottom' | 'left' | 'right' | 'center'
  type: 'feature' | 'tip' | 'warning' | 'new'
  action?: {
    text: string
    callback: () => void
  }
  spotlight?: boolean // Whether to highlight the target element
}

interface TooltipTour {
  id: string
  name: string
  description: string
  steps: TooltipStep[]
  category: string
  autoStart?: boolean
  dismissible: boolean
}

interface FeatureTooltipsProps {
  currentPage?: string
  enableAutoTours?: boolean
  onTourComplete?: (tourId: string) => void
  onTourSkip?: (tourId: string) => void
}

const tooltipTours: TooltipTour[] = [
  {
    id: 'project-creation-tour',
    name: 'Creating Your First Project',
    description: 'Learn how to create and set up your first project',
    category: 'getting-started',
    autoStart: true,
    dismissible: true,
    steps: [
      {
        id: 'new-project-button',
        target: '[data-tooltip="new-project"]',
        title: 'Create New Project',
        description: 'Click here to start creating a new project. You can choose from templates or start from scratch.',
        position: 'bottom',
        type: 'feature',
        spotlight: true
      },
      {
        id: 'project-templates',
        target: '[data-tooltip="project-templates"]',
        title: 'Choose a Template',
        description: 'Select from our curated templates to get started quickly with best practices built-in.',
        position: 'right',
        type: 'tip',
        spotlight: true
      },
      {
        id: 'ai-assistance',
        target: '[data-tooltip="ai-assistant"]',
        title: 'AI Assistant',
        description: 'Use our AI assistant to help generate code, explain concepts, and solve problems.',
        position: 'left',
        type: 'feature',
        spotlight: true,
        action: {
          text: 'Try AI Assistant',
          callback: () => console.log('Opening AI assistant')
        }
      }
    ]
  },
  {
    id: 'editor-features-tour',
    name: 'Code Editor Features',
    description: 'Discover powerful editing features',
    category: 'editor',
    autoStart: false,
    dismissible: true,
    steps: [
      {
        id: 'code-completion',
        target: '[data-tooltip="code-editor"]',
        title: 'Smart Code Completion',
        description: 'Get intelligent code suggestions as you type. Press Tab to accept suggestions.',
        position: 'top',
        type: 'feature',
        spotlight: false
      },
      {
        id: 'quick-actions',
        target: '[data-tooltip="quick-actions"]',
        title: 'Quick Actions',
        description: 'Right-click for context-aware actions like refactoring, formatting, and more.',
        position: 'bottom',
        type: 'tip',
        spotlight: true
      },
      {
        id: 'live-preview',
        target: '[data-tooltip="live-preview"]',
        title: 'Live Preview',
        description: 'See your changes in real-time without manual refreshing.',
        position: 'right',
        type: 'feature',
        spotlight: true
      }
    ]
  },
  {
    id: 'ai-features-tour',
    name: 'AI-Powered Development',
    description: 'Explore AI features that accelerate development',
    category: 'ai',
    autoStart: false,
    dismissible: true,
    steps: [
      {
        id: 'ai-chat',
        target: '[data-tooltip="ai-chat"]',
        title: 'AI Chat Assistant',
        description: 'Ask questions, get explanations, and receive coding help from our AI assistant.',
        position: 'left',
        type: 'new',
        spotlight: true
      },
      {
        id: 'code-generation',
        target: '[data-tooltip="code-generation"]',
        title: 'AI Code Generation',
        description: 'Generate entire functions, components, or modules using natural language descriptions.',
        position: 'bottom',
        type: 'feature',
        spotlight: true
      },
      {
        id: 'code-review',
        target: '[data-tooltip="code-review"]',
        title: 'AI Code Review',
        description: 'Get instant feedback on code quality, security, and best practices.',
        position: 'top',
        type: 'feature',
        spotlight: true
      }
    ]
  }
]

export function FeatureTooltips({ 
  currentPage, 
  enableAutoTours = true, 
  onTourComplete, 
  onTourSkip 
}: FeatureTooltipsProps) {
  const [activeTour, setActiveTour] = useState<TooltipTour | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [isVisible, setIsVisible] = useState(false)
  const [completedTours, setCompletedTours] = useState<string[]>([])
  const [dismissedTours, setDismissedTours] = useState<string[]>([])
  const tooltipRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Load completed/dismissed tours from localStorage
  useEffect(() => {
    const completed = JSON.parse(localStorage.getItem('completedTours') || '[]')
    const dismissed = JSON.parse(localStorage.getItem('dismissedTours') || '[]')
    setCompletedTours(completed)
    setDismissedTours(dismissed)
  }, [])

  // Auto-start relevant tours based on current page
  useEffect(() => {
    if (!enableAutoTours || activeTour) return

    const relevantTour = tooltipTours.find(tour => 
      tour.autoStart && 
      !completedTours.includes(tour.id) && 
      !dismissedTours.includes(tour.id) &&
      (currentPage === 'dashboard' && tour.category === 'getting-started')
    )

    if (relevantTour) {
      setTimeout(() => startTour(relevantTour), 1000) // Delay to ensure page is loaded
    }
  }, [currentPage, enableAutoTours, completedTours, dismissedTours, activeTour])

  // Update tooltip position when target element changes
  useEffect(() => {
    if (!activeTour || !isVisible) return

    const updatePosition = () => {
      const currentStep = activeTour.steps[currentStepIndex]
      const targetElement = document.querySelector(currentStep.target)
      
      if (targetElement && tooltipRef.current) {
        const targetRect = targetElement.getBoundingClientRect()
        const tooltipRect = tooltipRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        
        let x = 0, y = 0

        switch (currentStep.position) {
          case 'top':
            x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2
            y = targetRect.top - tooltipRect.height - 10
            break
          case 'bottom':
            x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2
            y = targetRect.bottom + 10
            break
          case 'left':
            x = targetRect.left - tooltipRect.width - 10
            y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2
            break
          case 'right':
            x = targetRect.right + 10
            y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2
            break
          case 'center':
            x = viewportWidth / 2 - tooltipRect.width / 2
            y = viewportHeight / 2 - tooltipRect.height / 2
            break
        }

        // Ensure tooltip stays within viewport
        x = Math.max(10, Math.min(x, viewportWidth - tooltipRect.width - 10))
        y = Math.max(10, Math.min(y, viewportHeight - tooltipRect.height - 10))

        setTooltipPosition({ x, y })
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition)
    }
  }, [activeTour, currentStepIndex, isVisible])

  const startTour = (tour: TooltipTour) => {
    setActiveTour(tour)
    setCurrentStepIndex(0)
    setIsVisible(true)
  }

  const nextStep = () => {
    if (!activeTour) return

    if (currentStepIndex < activeTour.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1)
    } else {
      completeTour()
    }
  }

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1)
    }
  }

  const completeTour = () => {
    if (!activeTour) return

    const newCompletedTours = [...completedTours, activeTour.id]
    setCompletedTours(newCompletedTours)
    localStorage.setItem('completedTours', JSON.stringify(newCompletedTours))
    
    onTourComplete?.(activeTour.id)
    closeTour()
  }

  const skipTour = () => {
    if (!activeTour) return

    if (activeTour.dismissible) {
      const newDismissedTours = [...dismissedTours, activeTour.id]
      setDismissedTours(newDismissedTours)
      localStorage.setItem('dismissedTours', JSON.stringify(newDismissedTours))
    }
    
    onTourSkip?.(activeTour.id)
    closeTour()
  }

  const closeTour = () => {
    setActiveTour(null)
    setCurrentStepIndex(0)
    setIsVisible(false)
  }

  const getStepTypeIcon = (type: TooltipStep['type']) => {
    switch (type) {
      case 'feature':
        return <Star className="w-4 h-4 text-blue-500" />
      case 'tip':
        return <Lightbulb className="w-4 h-4 text-yellow-500" />
      case 'warning':
        return <Target className="w-4 h-4 text-red-500" />
      case 'new':
        return <Zap className="w-4 h-4 text-green-500" />
    }
  }

  const getStepTypeBadge = (type: TooltipStep['type']) => {
    const variants = {
      feature: 'default',
      tip: 'secondary',
      warning: 'destructive',
      new: 'default'
    } as const

    const labels = {
      feature: 'Feature',
      tip: 'Tip',
      warning: 'Important',
      new: 'New'
    }

    return (
      <Badge variant={variants[type]} className="text-xs">
        {labels[type]}
      </Badge>
    )
  }

  // Available tours component for manual tour selection
  const AvailableTours = () => (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900 dark:text-white">Tours Available</h4>
          <HelpCircle className="w-4 h-4 text-gray-400" />
        </div>
        <div className="space-y-2">
          {tooltipTours
            .filter(tour => !completedTours.includes(tour.id) && !dismissedTours.includes(tour.id))
            .map(tour => (
              <button
                key={tour.id}
                onClick={() => startTour(tour)}
                className="w-full text-left p-2 rounded bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {tour.name}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {tour.description}
                </div>
              </button>
            ))}
        </div>
      </div>
    </div>
  )

  if (!activeTour || !isVisible) {
    return currentPage === 'dashboard' ? <AvailableTours /> : null
  }

  const currentStep = activeTour.steps[currentStepIndex]
  const targetElement = document.querySelector(currentStep.target)

  return (
    <>
      {/* Overlay */}
      <div 
        ref={overlayRef}
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={currentStep.spotlight ? undefined : closeTour}
      />

      {/* Spotlight for target element */}
      {currentStep.spotlight && targetElement && (
        <div
          className="fixed z-50 border-2 border-blue-500 rounded-lg shadow-lg pointer-events-none"
          style={{
            left: targetElement.getBoundingClientRect().left - 4,
            top: targetElement.getBoundingClientRect().top - 4,
            width: targetElement.getBoundingClientRect().width + 8,
            height: targetElement.getBoundingClientRect().height + 8,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-50 max-w-sm"
        style={{
          left: tooltipPosition.x,
          top: tooltipPosition.y
        }}
      >
        <Card className="shadow-xl border-0">
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                {getStepTypeIcon(currentStep.type)}
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {currentStep.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {getStepTypeBadge(currentStep.type)}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {currentStepIndex + 1} of {activeTour.steps.length}
                    </span>
                  </div>
                </div>
              </div>
              {activeTour.dismissible && (
                <Button variant="ghost" size="sm" onClick={closeTour}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Content */}
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {currentStep.description}
            </p>

            {/* Action Button */}
            {currentStep.action && (
              <div className="mb-4">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={currentStep.action.callback}
                  className="w-full"
                >
                  {currentStep.action.text}
                </Button>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={prevStep}
                  disabled={currentStepIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={skipTour}>
                  Skip Tour
                </Button>
                <Button size="sm" onClick={nextStep}>
                  {currentStepIndex === activeTour.steps.length - 1 ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Complete
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Progress Indicator */}
            <div className="mt-4">
              <div className="flex gap-1">
                {activeTour.steps.map((_, index) => (
                  <div
                    key={index}
                    className={`h-1 rounded-full flex-1 ${
                      index === currentStepIndex
                        ? 'bg-blue-500'
                        : index < currentStepIndex
                        ? 'bg-green-500'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export default FeatureTooltips
