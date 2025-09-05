"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { 
  ChevronLeft, ChevronRight, Check, Sparkles, Code, Zap, 
  Users, Shield, Rocket, ArrowRight, X 
} from "lucide-react";

interface WelcomeStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  content: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
}

interface WelcomeWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function WelcomeWizard({ isOpen, onClose, onComplete }: WelcomeWizardProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const steps: WelcomeStep[] = [
    {
      id: "welcome",
      title: `Welcome to Recoder.xyz, ${user?.name?.split(' ')[0] || 'there'}! 👋`,
      description: "Let's get you started with your AI-powered coding journey",
      icon: Sparkles,
      content: (
        <div className="text-center py-8">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-12 h-12 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Ready to revolutionize your coding?
          </h3>
          <p className="text-gray-600 max-w-md mx-auto leading-relaxed">
            Recoder.xyz combines multiple AI models to help you write better code, faster. 
            From intelligent autocomplete to full project generation, we've got you covered.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 max-w-sm mx-auto">
            <div className="bg-blue-50 rounded-lg p-3">
              <Code className="w-6 h-6 text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-blue-900">Multi-AI Intelligence</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <Zap className="w-6 h-6 text-purple-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-purple-900">Instant Generation</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "profile",
      title: "Complete Your Profile",
      description: "Tell us about yourself to personalize your experience",
      icon: Users,
      content: (
        <div className="py-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Let's personalize your experience
            </h3>
            <p className="text-gray-600">
              A complete profile helps us provide better AI recommendations
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">What we'll help you set up:</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Profile picture and display name
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Programming languages and skills
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  Coding preferences and goals
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  AI model preferences
                </li>
              </ul>
            </div>
          </div>
        </div>
      ),
      action: {
        label: "Set Up Profile",
        onClick: () => {
          // Navigate to profile settings
          window.location.href = "/settings/account";
        }
      }
    },
    {
      id: "security",
      title: "Secure Your Account",
      description: "Enable security features to protect your code and data",
      icon: Shield,
      content: (
        <div className="py-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Security first approach
            </h3>
            <p className="text-gray-600">
              Your code is valuable. Let's make sure it's protected.
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
              <h4 className="font-medium text-amber-900 mb-2">🛡️ Recommended Security Setup</h4>
              <ul className="space-y-2 text-sm text-amber-800">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
                  Enable two-factor authentication (2FA)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
                  Review active sessions and devices
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
                  Set up security notifications
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-600 rounded-full"></span>
                  Generate secure API keys
                </li>
              </ul>
            </div>
          </div>
        </div>
      ),
      action: {
        label: "Configure Security",
        onClick: () => {
          // Navigate to security settings
          window.location.href = "/settings/security";
        }
      }
    },
    {
      id: "first-project",
      title: "Create Your First Project",
      description: "Let's build something amazing together!",
      icon: Rocket,
      content: (
        <div className="py-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Rocket className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Time to code! 🚀
            </h3>
            <p className="text-gray-600">
              Choose from our templates or start from scratch
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Code className="w-4 h-4 text-blue-600" />
                </div>
                <h4 className="font-medium text-gray-900">Quick Start Templates</h4>
              </div>
              <p className="text-sm text-gray-600">
                Choose from React, Next.js, Python, or other popular templates
              </p>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                </div>
                <h4 className="font-medium text-gray-900">AI-Generated Project</h4>
              </div>
              <p className="text-sm text-gray-600">
                Describe what you want to build and let AI create it for you
              </p>
            </div>
          </div>
        </div>
      ),
      action: {
        label: "Start Coding",
        onClick: () => {
          // Navigate to new project page
          window.location.href = "/dashboard/new-project";
        }
      }
    },
    {
      id: "complete",
      title: "You're All Set! 🎉",
      description: "Welcome to the future of coding",
      icon: Check,
      content: (
        <div className="text-center py-8">
          <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-12 h-12 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome aboard! 🎉
          </h3>
          <p className="text-gray-600 max-w-md mx-auto leading-relaxed mb-6">
            You're now ready to harness the power of AI for your coding projects. 
            Remember, we're here to help you every step of the way.
          </p>
          
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 max-w-md mx-auto">
            <h4 className="font-semibold text-gray-900 mb-2">💡 Pro Tips:</h4>
            <ul className="text-sm text-gray-700 space-y-1 text-left">
              <li>• Use Ctrl/Cmd + K for quick commands</li>
              <li>• Try the AI chat for instant help</li>
              <li>• Explore templates for inspiration</li>
              <li>• Join our community for tips and tricks</li>
            </ul>
          </div>
        </div>
      )
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      setCompletedSteps(prev => new Set([...prev, steps[currentStep].id]));
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepAction = async () => {
    const step = steps[currentStep];
    if (step.action) {
      setIsLoading(true);
      try {
        await step.action.onClick();
      } finally {
        setIsLoading(false);
      }
    } else {
      nextStep();
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      // Mark onboarding as completed
      await fetch('/api/user/onboarding/complete', {
        method: 'POST',
        credentials: 'include'
      });
      
      onComplete();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    await handleComplete();
  };

  if (!isOpen) return null;

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <currentStepData.icon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {currentStepData.title}
                </h2>
                <p className="text-sm text-gray-600">
                  {currentStepData.description}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-gray-600 font-medium">
              {currentStep + 1} of {steps.length}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-96 overflow-y-auto">
          {currentStepData.content}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {currentStep < steps.length - 1 && (
                <button
                  onClick={handleSkip}
                  disabled={isLoading}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                >
                  Skip for now
                </button>
              )}
              
              {currentStep === steps.length - 1 ? (
                <button
                  onClick={handleComplete}
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      Complete Setup
                      <Rocket className="w-4 h-4" />
                    </>
                  )}
                </button>
              ) : currentStepData.action ? (
                <button
                  onClick={handleStepAction}
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      {currentStepData.action.label}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={nextStep}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
