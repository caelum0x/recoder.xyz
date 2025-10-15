/**
 * Onboarding Flow
 * Welcome new users and guide them through setup
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Terminal,
  Check,
  ArrowRight,
  ArrowLeft,
  User,
  Briefcase,
  Code2,
  Zap,
  Globe,
  Github,
  Sparkles
} from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: any;
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    role: '',
    company: '',
    teamSize: '',
    useCase: '',
    experience: '',
    platforms: [] as string[]
  });

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to Recoder!',
      description: 'Let\'s get you set up in just a few steps',
      icon: Sparkles
    },
    {
      id: 'role',
      title: 'What\'s your role?',
      description: 'This helps us personalize your experience',
      icon: User
    },
    {
      id: 'company',
      title: 'Tell us about your work',
      description: 'Help us understand your needs better',
      icon: Briefcase
    },
    {
      id: 'platforms',
      title: 'Choose your platforms',
      description: 'Select the platforms you want to use',
      icon: Code2
    },
    {
      id: 'complete',
      title: 'All set!',
      description: 'You\'re ready to start building',
      icon: Check
    }
  ];

  const roles = [
    { id: 'developer', label: 'Developer', icon: Code2 },
    { id: 'designer', label: 'Designer', icon: Sparkles },
    { id: 'product', label: 'Product Manager', icon: Briefcase },
    { id: 'founder', label: 'Founder/CEO', icon: Zap },
    { id: 'other', label: 'Other', icon: User }
  ];

  const teamSizes = [
    { id: '1', label: 'Just me' },
    { id: '2-10', label: '2-10 people' },
    { id: '11-50', label: '11-50 people' },
    { id: '51-200', label: '51-200 people' },
    { id: '200+', label: '200+ people' }
  ];

  const useCases = [
    { id: 'web', label: 'Web Development' },
    { id: 'mobile', label: 'Mobile Apps' },
    { id: 'api', label: 'API Development' },
    { id: 'automation', label: 'Automation' },
    { id: 'ai', label: 'AI/ML Projects' },
    { id: 'other', label: 'Other' }
  ];

  const platforms = [
    { id: 'web', label: 'Recoder Web', description: 'Browser-based development', icon: Globe },
    { id: 'cli', label: 'Recoder CLI', description: 'Terminal-based tools', icon: Terminal },
    { id: 'extension', label: 'VS Code Extension', description: 'IDE integration', icon: Code2 },
    { id: 'api', label: 'API Access', description: 'Direct API integration', icon: Zap }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    try {
      // Save onboarding data to backend
      const response = await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          completedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save onboarding data');
      }

      const result = await response.json();
      console.log('Onboarding saved:', result);

      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Error saving onboarding:', error);
      // Still redirect to dashboard even if save fails
      window.location.href = '/dashboard';
    }
  };

  const togglePlatform = (platformId: string) => {
    setFormData({
      ...formData,
      platforms: formData.platforms.includes(platformId)
        ? formData.platforms.filter(p => p !== platformId)
        : [...formData.platforms, platformId]
    });
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return formData.role !== '';
      case 2: return formData.company !== '' && formData.teamSize !== '' && formData.useCase !== '';
      case 3: return formData.platforms.length > 0;
      default: return true;
    }
  };

  const renderStepContent = () => {
    const step = steps[currentStep];
    const StepIcon = step.icon;

    switch (step.id) {
      case 'welcome':
        return (
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <StepIcon className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-4">{step.title}</h2>
            <p className="text-xl text-gray-400 mb-8">{step.description}</p>
            <div className="max-w-md mx-auto space-y-4 text-left">
              <div className="flex items-start space-x-3 p-4 rounded-lg bg-white/5 border border-white/10">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Access 50+ AI Models</div>
                  <div className="text-sm text-gray-400">Claude, GPT-4, Gemini, and more</div>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-4 rounded-lg bg-white/5 border border-white/10">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Multiple Platforms</div>
                  <div className="text-sm text-gray-400">Web, CLI, VS Code, and more</div>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-4 rounded-lg bg-white/5 border border-white/10">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Production Ready</div>
                  <div className="text-sm text-gray-400">Real code, not mock implementations</div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'role':
        return (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">{step.title}</h2>
              <p className="text-gray-400">{step.description}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
              {roles.map((role) => {
                const RoleIcon = role.icon;
                const isSelected = formData.role === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => setFormData({ ...formData, role: role.id })}
                    className={`p-6 rounded-2xl border backdrop-blur-xl text-left transition-all ${
                      isSelected
                        ? 'border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10'
                        : 'border-white/10 bg-black/50 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        isSelected
                          ? 'bg-gradient-to-br from-orange-500 to-purple-600'
                          : 'bg-white/5'
                      }`}>
                        <RoleIcon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold">{role.label}</div>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-orange-500" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 'company':
        return (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">{step.title}</h2>
              <p className="text-gray-400">{step.description}</p>
            </div>
            <div className="max-w-xl mx-auto space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Acme Inc."
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Team Size
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {teamSizes.map((size) => {
                    const isSelected = formData.teamSize === size.id;
                    return (
                      <button
                        key={size.id}
                        onClick={() => setFormData({ ...formData, teamSize: size.id })}
                        className={`p-4 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="font-medium text-center">{size.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Primary Use Case
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {useCases.map((useCase) => {
                    const isSelected = formData.useCase === useCase.id;
                    return (
                      <button
                        key={useCase.id}
                        onClick={() => setFormData({ ...formData, useCase: useCase.id })}
                        className={`p-4 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="font-medium text-center">{useCase.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );

      case 'platforms':
        return (
          <div>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">{step.title}</h2>
              <p className="text-gray-400">{step.description}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {platforms.map((platform) => {
                const PlatformIcon = platform.icon;
                const isSelected = formData.platforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    onClick={() => togglePlatform(platform.id)}
                    className={`p-6 rounded-2xl border backdrop-blur-xl text-left transition-all ${
                      isSelected
                        ? 'border-orange-500 bg-gradient-to-br from-orange-500/10 to-purple-600/10'
                        : 'border-white/10 bg-black/50 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start space-x-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'bg-gradient-to-br from-orange-500 to-purple-600'
                          : 'bg-white/5'
                      }`}>
                        <PlatformIcon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold mb-1">{platform.label}</div>
                        <div className="text-sm text-gray-400">{platform.description}</div>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-orange-500 flex-shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-4">{step.title}</h2>
            <p className="text-xl text-gray-400 mb-8">{step.description}</p>
            <div className="max-w-md mx-auto mb-8">
              <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
                <h3 className="font-bold mb-4">Your Setup</h3>
                <div className="space-y-3 text-left">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Role:</span>
                    <span className="font-medium capitalize">{formData.role || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Team Size:</span>
                    <span className="font-medium">{formData.teamSize || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Platforms:</span>
                    <span className="font-medium">{formData.platforms.length} selected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Progress Bar */}
      <div className="fixed top-0 w-full h-1 bg-white/10 z-50">
        <div
          className="h-full bg-gradient-to-r from-orange-500 to-purple-600 transition-all duration-500"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-1 w-full z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <div className="text-sm text-gray-400">
            Step {currentStep + 1} of {steps.length}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto">
          {/* Step Content */}
          <div className="mb-12 min-h-[500px]">
            {renderStepContent()}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            {currentStep === steps.length - 1 ? (
              <button
                onClick={handleComplete}
                className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
