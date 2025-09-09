'use client';

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Sparkles, Rocket, Code2, Smartphone, Globe, Database,
  Cpu, Layers, Shield, Zap, CheckCircle, ArrowRight,
  Monitor, Server, Cloud, GitBranch, Play, Settings, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { PWABuilder } from '@/components/pwa-generator/pwa-builder';

interface ProjectCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated?: (project: any) => void;
}

interface ProjectConfig {
  name: string;
  description: string;
  type: 'web' | 'mobile' | 'pwa' | 'backend' | 'fullstack' | 'ai' | 'blockchain' | 'microservice';
  complexity: 'simple' | 'medium' | 'complex' | 'enterprise';
  features: string[];
  technology: string[];
  useAI: boolean;
  deployment: string;
  team: string[];
  budget?: number;
  timeline: string;
}

const PROJECT_TYPES = [
  {
    id: 'web',
    name: 'Web Application',
    icon: Globe,
    description: 'Modern web apps with React, Next.js, Vue, or vanilla JS',
    color: 'bg-blue-500',
    features: ['Responsive Design', 'SEO Optimization', 'Performance Monitoring'],
    tech: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
    estimatedTime: '2-8 weeks'
  },
  {
    id: 'mobile',
    name: 'Mobile Application',
    icon: Smartphone,
    description: 'Cross-platform mobile apps with React Native, Flutter, or native',
    color: 'bg-green-500',
    features: ['Cross-Platform', 'Native Performance', 'App Store Deployment'],
    tech: ['React Native', 'Expo', 'Firebase', 'TypeScript'],
    estimatedTime: '4-12 weeks'
  },
  {
    id: 'pwa',
    name: 'Progressive Web App',
    icon: Monitor,
    description: 'Advanced PWAs with offline support, push notifications, and native features',
    color: 'bg-purple-500',
    features: ['Offline Support', 'Push Notifications', 'App Installation'],
    tech: ['React', 'Service Workers', 'Web Push API', 'IndexedDB'],
    estimatedTime: '3-10 weeks'
  },
  {
    id: 'backend',
    name: 'Backend API',
    icon: Server,
    description: 'Scalable backend APIs with Node.js, FastAPI, Django, or NestJS',
    color: 'bg-orange-500',
    features: ['RESTful APIs', 'Database Integration', 'Authentication'],
    tech: ['Node.js', 'Express', 'PostgreSQL', 'JWT'],
    estimatedTime: '2-6 weeks'
  },
  {
    id: 'fullstack',
    name: 'Full-Stack Application',
    icon: Layers,
    description: 'Complete applications with frontend, backend, and database',
    color: 'bg-indigo-500',
    features: ['End-to-End Solution', 'Real-time Features', 'Cloud Deployment'],
    tech: ['React', 'Node.js', 'PostgreSQL', 'Docker'],
    estimatedTime: '6-16 weeks'
  },
  {
    id: 'ai',
    name: 'AI-Powered Application',
    icon: Sparkles,
    description: 'AI-integrated apps with machine learning and LLM capabilities',
    color: 'bg-pink-500',
    features: ['AI Integration', 'Machine Learning', 'Natural Language Processing'],
    tech: ['Python', 'FastAPI', 'OpenAI API', 'TensorFlow'],
    estimatedTime: '4-12 weeks'
  },
  {
    id: 'blockchain',
    name: 'Blockchain Application',
    icon: Shield,
    description: 'Web3 applications with smart contracts and DeFi integration',
    color: 'bg-yellow-500',
    features: ['Smart Contracts', 'DeFi Integration', 'Wallet Connection'],
    tech: ['Solidity', 'Web3.js', 'Ethereum', 'IPFS'],
    estimatedTime: '8-20 weeks'
  },
  {
    id: 'microservice',
    name: 'Microservices Architecture',
    icon: Cpu,
    description: 'Distributed microservices with containerization and orchestration',
    color: 'bg-gray-500',
    features: ['Microservices', 'Container Orchestration', 'API Gateway'],
    tech: ['Docker', 'Kubernetes', 'Node.js', 'Redis'],
    estimatedTime: '10-24 weeks'
  }
];

const COMPLEXITY_LEVELS = [
  {
    id: 'simple',
    name: 'Simple',
    description: 'Basic functionality, quick to build',
    multiplier: 0.5,
    color: 'text-green-600'
  },
  {
    id: 'medium',
    name: 'Medium',
    description: 'Standard features and integrations',
    multiplier: 1.0,
    color: 'text-blue-600'
  },
  {
    id: 'complex',
    name: 'Complex',
    description: 'Advanced features and custom requirements',
    multiplier: 1.8,
    color: 'text-orange-600'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Mission-critical with high scalability needs',
    multiplier: 3.0,
    color: 'text-red-600'
  }
];

export function ProjectCreationModal({ open, onOpenChange, onProjectCreated }: ProjectCreationModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState<ProjectConfig>({
    name: '',
    description: '',
    type: 'web',
    complexity: 'medium',
    features: [],
    technology: [],
    useAI: true,
    deployment: 'cloud',
    team: [],
    timeline: '4-8 weeks'
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  const selectedProjectType = PROJECT_TYPES.find(type => type.id === config.type);
  const selectedComplexity = COMPLEXITY_LEVELS.find(comp => comp.id === config.complexity);

  const handleProjectTypeSelect = useCallback((typeId: string) => {
    const projectType = PROJECT_TYPES.find(type => type.id === typeId);
    if (projectType) {
      setConfig(prev => ({
        ...prev,
        type: typeId as ProjectConfig['type'],
        features: projectType.features,
        technology: projectType.tech,
        timeline: projectType.estimatedTime
      }));
      setCurrentStep(2);
    }
  }, []);

  const handleComplexitySelect = useCallback((complexityId: string) => {
    setConfig(prev => ({
      ...prev,
      complexity: complexityId as ProjectConfig['complexity']
    }));
  }, []);

  const generateProject = useCallback(async () => {
    if (!config.name || !config.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      // Simulate project generation progress
      const progressSteps = [
        { step: 10, message: 'Initializing AI project planning...' },
        { step: 25, message: 'Analyzing requirements and architecture...' },
        { step: 40, message: 'Generating project structure...' },
        { step: 60, message: 'Creating application code...' },
        { step: 80, message: 'Setting up deployment configuration...' },
        { step: 95, message: 'Finalizing project setup...' },
        { step: 100, message: 'Project generation complete!' }
      ];

      for (const { step, message } of progressSteps) {
        setGenerationProgress(step);
        toast.info(message);
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Call appropriate generation API based on project type
      let apiEndpoint = '/api/projects/create';
      if (config.type === 'mobile') {
        apiEndpoint = '/api/mobile-app-builder';
      } else if (config.type === 'pwa') {
        apiEndpoint = '/api/pwa-generator/generate';
      } else if (config.type === 'backend') {
        apiEndpoint = '/api/backend-generator/generate';
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          description: config.description,
          type: config.type,
          complexity: config.complexity,
          features: config.features,
          technology: config.technology,
          useAI: config.useAI,
          team: config.team,
          timeline: config.timeline,
          budget: config.budget
        })
      });

      if (!response.ok) {
        throw new Error('Project generation failed');
      }

      const result = await response.json();

      toast.success('Project created successfully!', {
        description: `${config.name} is ready for development`
      });

      onProjectCreated?.(result);
      onOpenChange(false);
      
      // Reset form
      setCurrentStep(1);
      setConfig({
        name: '',
        description: '',
        type: 'web',
        complexity: 'medium',
        features: [],
        technology: [],
        useAI: true,
        deployment: 'cloud',
        team: [],
        timeline: '4-8 weeks'
      });

    } catch (error) {
      console.error('Project generation error:', error);
      toast.error('Failed to create project', {
        description: 'Please try again or contact support'
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  }, [config, onProjectCreated, onOpenChange]);

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-2">Choose Your Project Type</h3>
              <p className="text-muted-foreground">
                Select the type of application you want to build with AI assistance
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {PROJECT_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <Card 
                    key={type.id}
                    className={`cursor-pointer transition-all hover:scale-105 hover:shadow-lg border-2 ${
                      config.type === type.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleProjectTypeSelect(type.id)}
                  >
                    <CardHeader className="text-center pb-2">
                      <div className={`w-12 h-12 ${type.color} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <CardTitle className="text-lg">{type.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground mb-3">{type.description}</p>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {type.features.slice(0, 2).map((feature, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Est. {type.estimatedTime}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold mb-2">Project Configuration</h3>
              <p className="text-muted-foreground">
                Configure your {selectedProjectType?.name} project
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="project-name">Project Name *</Label>
                  <Input
                    id="project-name"
                    placeholder="My Awesome Project"
                    value={config.name}
                    onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="project-description">Description *</Label>
                  <Textarea
                    id="project-description"
                    placeholder="Describe what your project does..."
                    value={config.description}
                    onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Project Complexity</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {COMPLEXITY_LEVELS.map((complexity) => (
                      <Card
                        key={complexity.id}
                        className={`cursor-pointer transition-all hover:scale-105 ${
                          config.complexity === complexity.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                        onClick={() => handleComplexitySelect(complexity.id)}
                      >
                        <CardContent className="p-3 text-center">
                          <div className={`font-semibold ${complexity.color}`}>
                            {complexity.name}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {complexity.description}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="use-ai"
                    checked={config.useAI}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, useAI: checked }))}
                  />
                  <Label htmlFor="use-ai" className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Enable AI-Powered Generation
                  </Label>
                </div>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {selectedProjectType && (
                        <selectedProjectType.icon className="w-5 h-5" />
                      )}
                      {selectedProjectType?.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">Key Features</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {config.features.map((feature, idx) => (
                            <Badge key={idx} variant="outline">{feature}</Badge>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Technology Stack</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {config.technology.map((tech, idx) => (
                            <Badge key={idx} variant="secondary">{tech}</Badge>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Estimated Timeline</Label>
                        <p className="text-sm text-muted-foreground">{config.timeline}</p>
                      </div>

                      {selectedComplexity && (
                        <div>
                          <Label className="text-sm font-medium">Complexity</Label>
                          <p className={`text-sm font-semibold ${selectedComplexity.color}`}>
                            {selectedComplexity.name} - {selectedComplexity.description}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {config.useAI && (
                  <Alert>
                    <Sparkles className="h-4 w-4" />
                    <AlertDescription>
                      AI will generate optimized code, architecture recommendations, and deployment configurations for your project.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>

            {/* PWA Builder Integration */}
            {config.type === 'pwa' && (
              <div className="mt-8">
                <h4 className="text-lg font-semibold mb-4">PWA Configuration</h4>
                <PWABuilder 
                  className="border rounded-lg p-4"
                  onConfigChange={(pwaConfig) => {
                    setConfig(prev => ({ 
                      ...prev, 
                      features: [...prev.features, ...Object.keys(pwaConfig.features || {}).filter(f => pwaConfig.features?.[f as keyof typeof pwaConfig.features])]
                    }));
                  }}
                />
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold mb-2">Project Generation</h3>
              <p className="text-muted-foreground">
                {isGenerating ? 'Creating your project with AI...' : 'Review and generate your project'}
              </p>
            </div>

            {isGenerating ? (
              <div className="space-y-4">
                <Progress value={generationProgress} className="w-full" />
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Generating {config.name}...</span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Project Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div><strong>Name:</strong> {config.name}</div>
                    <div><strong>Type:</strong> {selectedProjectType?.name}</div>
                    <div><strong>Complexity:</strong> {selectedComplexity?.name}</div>
                    <div><strong>AI Generation:</strong> {config.useAI ? 'Enabled' : 'Disabled'}</div>
                    <div><strong>Timeline:</strong> {config.timeline}</div>
                  </CardContent>
                </Card>

                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Ready to generate your project! This will create a complete, production-ready application structure.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-6 h-6" />
            Create New Project
          </DialogTitle>
          <DialogDescription>
            Generate production-ready applications with AI-powered development tools
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center mb-8">
            {[1, 2, 3].map((step) => (
              <React.Fragment key={step}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  currentStep >= step 
                    ? 'bg-blue-500 border-blue-500 text-white' 
                    : 'border-gray-300 text-gray-400'
                }`}>
                  {step}
                </div>
                {step < 3 && (
                  <div className={`w-16 h-0.5 ${
                    currentStep > step ? 'bg-blue-500' : 'bg-gray-300'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step Content */}
          {renderStepContent()}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (currentStep > 1) {
                  setCurrentStep(prev => prev - 1);
                } else {
                  onOpenChange(false);
                }
              }}
              disabled={isGenerating}
            >
              {currentStep === 1 ? 'Cancel' : 'Back'}
            </Button>

            <Button
              onClick={() => {
                if (currentStep < 3) {
                  setCurrentStep(prev => prev + 1);
                } else {
                  generateProject();
                }
              }}
              disabled={isGenerating || (currentStep === 2 && (!config.name || !config.description))}
              className="flex items-center gap-2"
            >
              {currentStep === 3 ? (
                isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Generate Project
                  </>
                )
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
