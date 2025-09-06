"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useState, useEffect } from "react";
import { redirect, useRouter } from "next/navigation";
import { 
  ArrowRight, Check, Star, Code, Zap, Users, Shield, Globe,
  Github, Cpu, Database, Palette, Settings, Rocket, Target,
  BookOpen, Play, ChevronRight, ChevronLeft, Sparkles, Award,
  Coffee, Heart, Lightbulb, Trophy, Briefcase, GraduationCap
} from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: React.ReactNode;
  skippable: boolean;
}

interface UserProfile {
  role?: 'developer' | 'designer' | 'manager' | 'student' | 'other';
  experience?: 'beginner' | 'intermediate' | 'expert';
  interests?: string[];
  goals?: string[];
  teamSize?: 'solo' | 'small' | 'medium' | 'large';
  primaryLanguage?: string;
}

export default function WelcomeWizard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState<UserProfile>({});
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user && !loading) {
      redirect("/login");
    }
  }, [user, loading]);

  useEffect(() => {
    // Check if user has already completed onboarding
    checkOnboardingStatus();
  }, [user]);

  const checkOnboardingStatus = async () => {
    try {
      const response = await fetch("/api/user/onboarding", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.completed) {
          // Redirect to dashboard if already completed
          router.push("/dashboard");
        }
      }
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
    }
  };

  const completeOnboarding = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profile, completed: true })
      });

      if (response.ok) {
        setIsComplete(true);
        // Redirect to personalized dashboard after a short delay
        setTimeout(() => {
          router.push("/dashboard?welcome=true");
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipStep = () => {
    if (steps[currentStep].skippable) {
      nextStep();
    }
  };

  // Welcome Step Component
  const WelcomeStep = () => (
    <div className="text-center">
      <div className="mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Recoder.xyz! 🎉
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          The AI-powered development platform that generates real, production-ready code. 
          Let's get you set up in just a few minutes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors">
          <Code className="w-8 h-8 text-indigo-600 mb-3 mx-auto" />
          <h3 className="font-semibold text-gray-900 mb-2">Real Code Generation</h3>
          <p className="text-sm text-gray-600">AI that writes production-ready code, not mockups</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors">
          <Zap className="w-8 h-8 text-indigo-600 mb-3 mx-auto" />
          <h3 className="font-semibold text-gray-900 mb-2">Multi-Language Support</h3>
          <p className="text-sm text-gray-600">JavaScript, Python, Java, C++, Rust, Go, and more</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors">
          <Users className="w-8 h-8 text-indigo-600 mb-3 mx-auto" />
          <h3 className="font-semibold text-gray-900 mb-2">Team Collaboration</h3>
          <p className="text-sm text-gray-600">Built for teams with advanced sharing and permissions</p>
        </div>
      </div>

      <div className="bg-indigo-50 p-6 rounded-lg">
        <div className="flex items-center gap-2 justify-center text-indigo-700 mb-2">
          <Trophy className="w-5 h-5" />
          <span className="font-medium">Pro Tip</span>
        </div>
        <p className="text-indigo-600">
          Complete this quick setup to unlock personalized features and get the most out of your Recoder experience.
        </p>
      </div>
    </div>
  );

  // Role Selection Step
  const RoleStep = () => (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">What's your primary role?</h2>
        <p className="text-gray-600">This helps us customize your experience and show relevant features.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { value: 'developer', icon: Code, label: 'Developer', desc: 'I write code and build applications' },
          { value: 'designer', icon: Palette, label: 'Designer', desc: 'I focus on UI/UX and visual design' },
          { value: 'manager', icon: Briefcase, label: 'Manager/Lead', desc: 'I manage teams and projects' },
          { value: 'student', icon: GraduationCap, label: 'Student', desc: 'I\'m learning to code or in school' },
        ].map((role) => (
          <button
            key={role.value}
            onClick={() => setProfile({ ...profile, role: role.value as any })}
            className={`p-6 rounded-lg border-2 text-left transition-all hover:border-indigo-300 ${
              profile.role === role.value
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${
                profile.role === role.value ? "bg-indigo-500" : "bg-gray-100"
              }`}>
                <role.icon className={`w-6 h-6 ${
                  profile.role === role.value ? "text-white" : "text-gray-600"
                }`} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{role.label}</h3>
                <p className="text-sm text-gray-600">{role.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // Experience Level Step
  const ExperienceStep = () => (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">What's your experience level?</h2>
        <p className="text-gray-600">We'll adjust our recommendations and tutorials accordingly.</p>
      </div>

      <div className="space-y-4">
        {[
          { 
            value: 'beginner', 
            label: 'Beginner', 
            desc: 'New to coding or just getting started',
            features: ['Step-by-step tutorials', 'Code explanations', 'Learning resources']
          },
          { 
            value: 'intermediate', 
            label: 'Intermediate', 
            desc: 'Comfortable with basics, exploring advanced topics',
            features: ['Advanced patterns', 'Best practices', 'Performance tips']
          },
          { 
            value: 'expert', 
            label: 'Expert', 
            desc: 'Experienced developer who knows the ropes',
            features: ['Complex architectures', 'Optimization tools', 'Advanced integrations']
          },
        ].map((level) => (
          <button
            key={level.value}
            onClick={() => setProfile({ ...profile, experience: level.value as any })}
            className={`w-full p-6 rounded-lg border-2 text-left transition-all hover:border-indigo-300 ${
              profile.experience === level.value
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">{level.label}</h3>
                <p className="text-gray-600 mb-3">{level.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {level.features.map((feature, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
              <div className={`p-2 rounded-full ${
                profile.experience === level.value ? "bg-indigo-500" : "bg-gray-200"
              }`}>
                <Check className={`w-4 h-4 ${
                  profile.experience === level.value ? "text-white" : "text-transparent"
                }`} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // Interests Step
  const InterestsStep = () => {
    const interests = [
      { id: 'web-dev', label: 'Web Development', icon: Globe },
      { id: 'mobile-dev', label: 'Mobile Development', icon: Cpu },
      { id: 'backend', label: 'Backend/APIs', icon: Database },
      { id: 'ai-ml', label: 'AI/Machine Learning', icon: Zap },
      { id: 'devops', label: 'DevOps/Infrastructure', icon: Settings },
      { id: 'blockchain', label: 'Blockchain/Web3', icon: Shield },
    ];

    const toggleInterest = (interestId: string) => {
      const currentInterests = profile.interests || [];
      const updated = currentInterests.includes(interestId)
        ? currentInterests.filter(id => id !== interestId)
        : [...currentInterests, interestId];
      setProfile({ ...profile, interests: updated });
    };

    return (
      <div>
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">What interests you most?</h2>
          <p className="text-gray-600">Select all that apply. We'll curate relevant content and tools.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {interests.map((interest) => {
            const isSelected = (profile.interests || []).includes(interest.id);
            return (
              <button
                key={interest.id}
                onClick={() => toggleInterest(interest.id)}
                className={`p-6 rounded-lg border-2 text-left transition-all hover:border-indigo-300 ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${
                    isSelected ? "bg-indigo-500" : "bg-gray-100"
                  }`}>
                    <interest.icon className={`w-6 h-6 ${
                      isSelected ? "text-white" : "text-gray-600"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{interest.label}</h3>
                  </div>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-500"
                      : "border-gray-300"
                  }`}>
                    <Check className={`w-3 h-3 text-white ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Goals Step
  const GoalsStep = () => {
    const goals = [
      'Learn new programming languages',
      'Build personal projects',
      'Improve code quality',
      'Speed up development',
      'Collaborate with team',
      'Deploy to production',
      'Learn best practices',
      'Automate workflows'
    ];

    const toggleGoal = (goal: string) => {
      const currentGoals = profile.goals || [];
      const updated = currentGoals.includes(goal)
        ? currentGoals.filter(g => g !== goal)
        : [...currentGoals, goal];
      setProfile({ ...profile, goals: updated });
    };

    return (
      <div>
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">What are your goals?</h2>
          <p className="text-gray-600">Select your main objectives so we can help you achieve them.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {goals.map((goal) => {
            const isSelected = (profile.goals || []).includes(goal);
            return (
              <button
                key={goal}
                onClick={() => toggleGoal(goal)}
                className={`p-4 rounded-lg border-2 text-left transition-all hover:border-indigo-300 ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-500"
                      : "border-gray-300"
                  }`}>
                    <Check className={`w-3 h-3 text-white ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                  <span className="font-medium text-gray-900">{goal}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Setup Complete Step
  const CompleteStep = () => (
    <div className="text-center">
      <div className="mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          You're all set! 🚀
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          Your personalized Recoder.xyz experience is ready. Let's start building amazing things together!
        </p>
      </div>

      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-8 rounded-lg mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">What's Next?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <Play className="w-6 h-6 text-indigo-600" />
            </div>
            <h4 className="font-medium text-gray-900 mb-1">Try the Code Generator</h4>
            <p className="text-sm text-gray-600">Generate your first piece of real code</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-6 h-6 text-indigo-600" />
            </div>
            <h4 className="font-medium text-gray-900 mb-1">Explore Tutorials</h4>
            <p className="text-sm text-gray-600">Learn with interactive guides</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-indigo-600" />
            </div>
            <h4 className="font-medium text-gray-900 mb-1">Invite Your Team</h4>
            <p className="text-sm text-gray-600">Collaborate with teammates</p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 text-gray-600">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
          <span>Setting up your dashboard...</span>
        </div>
      )}
    </div>
  );

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome',
      description: 'Welcome to Recoder.xyz',
      component: <WelcomeStep />,
      skippable: false
    },
    {
      id: 'role',
      title: 'Your Role',
      description: 'Tell us about yourself',
      component: <RoleStep />,
      skippable: true
    },
    {
      id: 'experience',
      title: 'Experience',
      description: 'Your skill level',
      component: <ExperienceStep />,
      skippable: true
    },
    {
      id: 'interests',
      title: 'Interests',
      description: 'What you want to build',
      component: <InterestsStep />,
      skippable: true
    },
    {
      id: 'goals',
      title: 'Goals',
      description: 'What you want to achieve',
      component: <GoalsStep />,
      skippable: true
    },
    {
      id: 'complete',
      title: 'Complete',
      description: 'Setup complete',
      component: <CompleteStep />,
      skippable: false
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (isComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-green-50 to-emerald-50 flex items-center justify-center">
        <CompleteStep />
      </div>
    );
  }

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-1 bg-gray-200">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Step Indicator */}
          <div className="flex justify-center mb-12">
            <div className="flex items-center space-x-2">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    index <= currentStep
                      ? "bg-indigo-500 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}>
                    {index < currentStep ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-8 h-1 mx-2 ${
                      index < currentStep ? "bg-indigo-500" : "bg-gray-200"
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-8 md:p-12">
              {currentStepData.component}
            </div>

            {/* Navigation */}
            <div className="border-t border-gray-200 px-8 md:px-12 py-6 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {currentStep > 0 && (
                    <button
                      onClick={prevStep}
                      className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </button>
                  )}
                  {currentStepData.skippable && (
                    <button
                      onClick={skipStep}
                      className="px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Skip
                    </button>
                  )}
                </div>

                <button
                  onClick={nextStep}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {currentStep === steps.length - 1 ? (
                    isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Setting up...
                      </>
                    ) : (
                      <>
                        Get Started
                        <Rocket className="w-4 h-4" />
                      </>
                    )
                  ) : (
                    <>
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Help Text */}
          <div className="text-center mt-8">
            <p className="text-sm text-gray-500">
              Need help? <a href="/support" className="text-indigo-600 hover:text-indigo-700">Contact our support team</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const runtime = "edge";