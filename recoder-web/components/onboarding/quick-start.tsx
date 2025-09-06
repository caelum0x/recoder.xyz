'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Rocket, Code2, Zap, Users, Play, CheckCircle, ArrowRight,
  Lightbulb, Target, Clock, Star, Globe, Settings, GitBranch,
  Sparkles, Trophy, Coffee, Heart, Briefcase, GraduationCap,
  Database, Shield, Cpu, Brain, ChevronRight, Plus, Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface QuickStartStep {
  id: string;
  title: string;
  description: string;
  icon: any;
  component: React.ReactNode;
  completed: boolean;
  required: boolean;
}

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  type: 'web' | 'mobile' | 'api' | 'desktop' | 'ai' | 'blockchain';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tech: string[];
  features: string[];
  estimatedTime: string;
  icon: any;
}

export default function QuickStartGuide() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [projectData, setProjectData] = useState({
    name: '',
    description: '',
    template: '',
    type: '',
    goals: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [completedSteps, setCompletedSteps] = useState(new Set<number>());

  const templates: ProjectTemplate[] = [
    {
      id: 'react-webapp',
      name: 'React Web Application',
      description: 'Modern React app with TypeScript, Tailwind CSS, and real-time features',
      type: 'web',
      difficulty: 'beginner',
      tech: ['React', 'TypeScript', 'Tailwind CSS', 'Next.js'],
      features: ['Authentication', 'Dashboard', 'API Integration', 'Responsive Design'],
      estimatedTime: '15 minutes',
      icon: Globe
    },
    {
      id: 'nodejs-api',
      name: 'Node.js REST API',
      description: 'Production-ready API with authentication, database, and documentation',
      type: 'api',
      difficulty: 'intermediate',
      tech: ['Node.js', 'Express', 'PostgreSQL', 'JWT'],
      features: ['User Auth', 'CRUD Operations', 'Rate Limiting', 'Swagger Docs'],
      estimatedTime: '20 minutes',
      icon: Database
    },
    {
      id: 'mobile-app',
      name: 'React Native Mobile App',
      description: 'Cross-platform mobile app with native features and cloud backend',
      type: 'mobile',
      difficulty: 'intermediate',
      tech: ['React Native', 'Expo', 'Firebase', 'TypeScript'],
      features: ['Push Notifications', 'Offline Storage', 'Camera', 'Maps'],
      estimatedTime: '25 minutes',
      icon: Cpu
    },
    {
      id: 'ai-assistant',
      name: 'AI-Powered Assistant',
      description: 'Intelligent chatbot with natural language processing and learning',
      type: 'ai',
      difficulty: 'advanced',
      tech: ['Python', 'OpenAI API', 'FastAPI', 'Vector DB'],
      features: ['Natural Language', 'Context Memory', 'Tool Integration', 'Learning'],
      estimatedTime: '30 minutes',
      icon: Brain
    },
    {
      id: 'blockchain-dapp',
      name: 'Blockchain DApp',
      description: 'Decentralized application with smart contracts and Web3 integration',
      type: 'blockchain',
      difficulty: 'advanced',
      tech: ['Solidity', 'React', 'Web3.js', 'IPFS'],
      features: ['Smart Contracts', 'Wallet Connection', 'Token Operations', 'DeFi'],
      estimatedTime: '35 minutes',
      icon: Shield
    },
    {
      id: 'desktop-app',
      name: 'Desktop Application',
      description: 'Cross-platform desktop app with native OS integration',
      type: 'desktop',
      difficulty: 'intermediate',
      tech: ['Electron', 'React', 'Node.js', 'SQLite'],
      features: ['File System', 'System Tray', 'Auto Updates', 'Native Menus'],
      estimatedTime: '25 minutes',
      icon: Settings
    }
  ];

  const goalOptions = [
    'Learn new technologies',
    'Build portfolio projects',
    'Create business application',
    'Experiment with AI',
    'Develop mobile solutions',
    'Explore blockchain',
    'Build team collaboration tools',
    'Create educational content'
  ];

  // Step 1: Welcome and Goal Setting
  const WelcomeStep = () => (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
        <Rocket className="w-10 h-10 text-white" />
      </div>
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Welcome to Recoder.xyz! 🚀
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Let's get you started with your first AI-powered project. This quick guide will help you 
          create something amazing in just a few minutes.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold mb-4">What do you want to achieve?</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {goalOptions.map((goal) => (
            <button
              key={goal}
              onClick={() => {
                const newGoals = projectData.goals.includes(goal)
                  ? projectData.goals.filter(g => g !== goal)
                  : [...projectData.goals, goal];
                setProjectData({ ...projectData, goals: newGoals });
              }}
              className={`p-3 rounded-lg border-2 text-sm transition-all hover:border-blue-300 ${
                projectData.goals.includes(goal)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {goal}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex items-center gap-2 justify-center text-blue-700 mb-2">
          <Lightbulb className="w-5 h-5" />
          <span className="font-medium">Pro Tip</span>
        </div>
        <p className="text-blue-600 text-sm">
          Select multiple goals to get personalized project recommendations. 
          You can always explore other areas later!
        </p>
      </div>
    </div>
  );

  // Step 2: Template Selection
  const TemplateSelectionStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Choose Your Project Template
        </h2>
        <p className="text-gray-600">
          Pick a template that matches your goals. All templates include real, production-ready code.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {templates.map((template) => {
          const isSelected = projectData.template === template.id;
          return (
            <Card 
              key={template.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:border-blue-300'
              }`}
              onClick={() => setProjectData({ ...projectData, template: template.id, type: template.type })}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      isSelected ? 'bg-blue-500' : 'bg-gray-100'
                    }`}>
                      <template.icon className={`w-6 h-6 ${
                        isSelected ? 'text-white' : 'text-gray-600'
                      }`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={
                          template.difficulty === 'beginner' ? 'secondary' :
                          template.difficulty === 'intermediate' ? 'default' : 'destructive'
                        }>
                          {template.difficulty}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <Clock className="w-3 h-3" />
                          {template.estimatedTime}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle className="w-6 h-6 text-blue-500" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">{template.description}</p>
                
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm mb-2">Technologies:</h4>
                    <div className="flex flex-wrap gap-1">
                      {template.tech.map((tech) => (
                        <Badge key={tech} variant="outline" className="text-xs">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-sm mb-2">Features Included:</h4>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {template.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  // Step 3: Project Configuration
  const ProjectConfigStep = () => {
    const selectedTemplate = templates.find(t => t.id === projectData.template);
    
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Configure Your Project
          </h2>
          <p className="text-gray-600">
            Customize your {selectedTemplate?.name} with your preferences.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selectedTemplate?.icon && <selectedTemplate.icon className="w-5 h-5" />}
              {selectedTemplate?.name}
            </CardTitle>
            <CardDescription>{selectedTemplate?.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="project-name">Project Name *</Label>
              <Input
                id="project-name"
                placeholder="My Awesome Project"
                value={projectData.name}
                onChange={(e) => setProjectData({ ...projectData, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                placeholder="Describe what your project will do..."
                value={projectData.description}
                onChange={(e) => setProjectData({ ...projectData, description: e.target.value })}
                className="mt-1 min-h-[100px]"
              />
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI-Powered Generation
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                Our AI will generate production-ready code tailored to your specifications, 
                including best practices, security features, and modern patterns.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-green-700">Real, functional code (not templates)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Step 4: Generation and Summary
  const GenerationStep = () => {
    const selectedTemplate = templates.find(t => t.id === projectData.template);
    
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to Create! 🎉
          </h2>
          <p className="text-gray-600">
            Review your project details and we'll generate everything for you.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Project Summary</CardTitle>
            <CardDescription>Here's what we'll create for you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Project Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Name:</span>
                    <span className="font-medium">{projectData.name || 'My Awesome Project'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Template:</span>
                    <span className="font-medium">{selectedTemplate?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Type:</span>
                    <Badge variant="outline">{selectedTemplate?.type}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Estimated Time:</span>
                    <span className="font-medium">{selectedTemplate?.estimatedTime}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Your Goals</h4>
                <div className="space-y-1">
                  {projectData.goals.length > 0 ? (
                    projectData.goals.map((goal) => (
                      <div key={goal} className="flex items-center gap-2 text-sm">
                        <Target className="w-3 h-3 text-blue-500" />
                        <span>{goal}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No specific goals selected</p>
                  )}
                </div>
              </div>
            </div>

            {projectData.description && (
              <div>
                <h4 className="font-semibold mb-2">Description</h4>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  {projectData.description}
                </p>
              </div>
            )}

            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                What You'll Get
              </h4>
              <ul className="text-sm text-green-800 space-y-1">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Complete, production-ready codebase
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Integrated development environment
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  AI assistant for ongoing development
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  One-click deployment options
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Best practices and security features
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const steps: QuickStartStep[] = [
    {
      id: 'welcome',
      title: 'Welcome & Goals',
      description: 'Set your development goals',
      icon: Target,
      component: <WelcomeStep />,
      completed: completedSteps.has(0),
      required: false
    },
    {
      id: 'template',
      title: 'Choose Template',
      description: 'Select your project type',
      icon: Code2,
      component: <TemplateSelectionStep />,
      completed: completedSteps.has(1),
      required: true
    },
    {
      id: 'configure',
      title: 'Configure Project',
      description: 'Customize your settings',
      icon: Settings,
      component: <ProjectConfigStep />,
      completed: completedSteps.has(2),
      required: true
    },
    {
      id: 'generate',
      title: 'Generate & Launch',
      description: 'Create your project',
      icon: Rocket,
      component: <GenerationStep />,
      completed: completedSteps.has(3),
      required: true
    }
  ];

  const canProceed = () => {
    switch (currentStep) {
      case 0: return true; // Goals are optional
      case 1: return projectData.template !== '';
      case 2: return projectData.name.trim() !== '';
      case 3: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (canProceed() && currentStep < steps.length - 1) {
      setCompletedSteps(prev => new Set([...prev, currentStep]));
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleGenerateProject = async () => {
    if (!projectData.name.trim() || !projectData.template) {
      toast.error('Please provide a project name and select a template');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/projects/quick-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectData.name,
          description: projectData.description,
          template: projectData.template,
          type: projectData.type,
          goals: projectData.goals,
        })
      });

      if (response.ok) {
        const { project } = await response.json();
        toast.success('Project created successfully!');
        
        // Mark final step as completed
        setCompletedSteps(prev => new Set([...prev, 3]));
        
        // Redirect to the new project
        setTimeout(() => {
          router.push(`/projects/${project.id}?welcome=true`);
        }, 1500);
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to create project');
      }
    } catch (error) {
      console.error('Project creation error:', error);
      toast.error('Failed to create project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Quick Start Guide</h1>
          <Badge variant="outline">
            Step {currentStep + 1} of {steps.length}
          </Badge>
        </div>
        
        <Progress value={progress} className="h-2 mb-4" />
        
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div 
              key={step.id}
              className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
            >
              <div className={`flex items-center gap-2 ${
                index <= currentStep ? 'text-blue-600' : 'text-gray-400'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  index < currentStep ? 'bg-green-500 text-white' :
                  index === currentStep ? 'bg-blue-500 text-white' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {index < currentStep ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <step.icon className="w-4 h-4" />
                  )}
                </div>
                <span className="text-sm font-medium hidden md:block">{step.title}</span>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-4 ${
                  index < currentStep ? 'bg-green-500' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="mb-8">
        <CardContent className="p-8">
          {steps[currentStep]?.component}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentStep === 0}
          className="flex items-center gap-2"
        >
          Previous
        </Button>

        <div className="flex items-center gap-2">
          {currentStep < steps.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleGenerateProject}
              disabled={loading || !canProceed()}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Creating Project...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Create My Project!
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Need help? Check out our{' '}
          <a href="/docs" className="text-blue-600 hover:text-blue-700">
            documentation
          </a>{' '}
          or{' '}
          <a href="/support" className="text-blue-600 hover:text-blue-700">
            contact support
          </a>
        </p>
      </div>
    </div>
  );
}