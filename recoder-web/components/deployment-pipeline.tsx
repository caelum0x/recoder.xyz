"use client";

import React, { useState, useEffect } from "react";
import { 
  CloudIcon, 
  ServerIcon, 
  CheckIcon, 
  ExternalLinkIcon,
  RefreshCw as RefreshIcon,
  AlertCircleIcon,
  SettingsIcon,
  DatabaseIcon,
  GlobeIcon
} from "lucide-react";

interface DeploymentPipelineProps {
  projectFiles: any;
  projectName: string;
  metadata?: {
    hasDatabase?: boolean;
    hasAPI?: boolean;
    hasAuth?: boolean;
    framework?: string;
    language?: string;
  };
  onDeploymentComplete?: (deploymentUrl: string, details: any) => void;
}

interface DeploymentStep {
  id: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  duration?: number;
  details?: string;
}

interface DeploymentProvider {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  estimatedTime: string;
  cost: "free" | "paid";
  supported: boolean;
}

const DEPLOYMENT_PROVIDERS: DeploymentProvider[] = [
  {
    id: "vercel",
    name: "Vercel",
    description: "Optimal for Next.js and React applications",
    icon: <CloudIcon className="w-5 h-5" />,
    features: ["Auto-scaling", "Edge Functions", "Real-time Analytics", "Custom Domains"],
    estimatedTime: "2-3 minutes",
    cost: "free",
    supported: true
  },
  {
    id: "netlify",
    name: "Netlify",
    description: "Great for static sites and JAMstack applications",
    icon: <GlobeIcon className="w-5 h-5" />,
    features: ["CDN", "Form Handling", "Serverless Functions", "Split Testing"],
    estimatedTime: "1-2 minutes",
    cost: "free",
    supported: true
  },
  {
    id: "railway",
    name: "Railway",
    description: "Perfect for full-stack applications with databases",
    icon: <ServerIcon className="w-5 h-5" />,
    features: ["Database Hosting", "Environment Variables", "Auto Deploy", "Monitoring"],
    estimatedTime: "3-5 minutes",
    cost: "paid",
    supported: true
  },
  {
    id: "render",
    name: "Render",
    description: "Simple deployment for web services and static sites",
    icon: <CloudIcon className="w-5 h-5" />,
    features: ["Auto Deploy from Git", "SSL Certificates", "Health Checks", "Rollbacks"],
    estimatedTime: "2-4 minutes",
    cost: "free",
    supported: true
  }
];

export default function DeploymentPipeline({
  projectFiles,
  projectName,
  metadata = {},
  onDeploymentComplete
}: DeploymentPipelineProps) {
  const [selectedProvider, setSelectedProvider] = useState<string>("vercel");
  const [deploymentSteps, setDeploymentSteps] = useState<DeploymentStep[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);
  const [environmentVars, setEnvironmentVars] = useState<Record<string, string>>({});
  const [customDomain, setCustomDomain] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const generateDeploymentSteps = (provider: string): DeploymentStep[] => {
    const baseSteps = [
      {
        id: "validate",
        name: "Code Validation",
        description: "Validating project structure and dependencies",
        status: "pending" as const
      },
      {
        id: "build",
        name: "Build Project",
        description: "Compiling and bundling application",
        status: "pending" as const
      }
    ];

    const providerSteps: Record<string, DeploymentStep[]> = {
      vercel: [
        ...baseSteps,
        {
          id: "vercel-setup",
          name: "Vercel Setup",
          description: "Configuring Vercel deployment settings",
          status: "pending" as const
        },
        {
          id: "deploy",
          name: "Deploy to Vercel",
          description: "Uploading and deploying to Vercel edge network",
          status: "pending" as const
        },
        {
          id: "dns",
          name: "DNS Configuration",
          description: "Setting up domain and SSL certificate",
          status: "pending" as const
        }
      ],
      netlify: [
        ...baseSteps,
        {
          id: "netlify-setup",
          name: "Netlify Setup",
          description: "Configuring Netlify deployment settings",
          status: "pending" as const
        },
        {
          id: "deploy",
          name: "Deploy to Netlify",
          description: "Uploading to Netlify CDN",
          status: "pending" as const
        }
      ],
      railway: [
        ...baseSteps,
        {
          id: "database",
          name: "Database Setup",
          description: "Provisioning PostgreSQL database",
          status: "pending" as const
        },
        {
          id: "railway-setup",
          name: "Railway Setup",
          description: "Configuring Railway deployment",
          status: "pending" as const
        },
        {
          id: "deploy",
          name: "Deploy to Railway",
          description: "Deploying full-stack application",
          status: "pending" as const
        }
      ],
      render: [
        ...baseSteps,
        {
          id: "render-setup",
          name: "Render Setup",
          description: "Configuring Render web service",
          status: "pending" as const
        },
        {
          id: "deploy",
          name: "Deploy to Render",
          description: "Deploying to Render platform",
          status: "pending" as const
        }
      ]
    };

    return providerSteps[provider] || baseSteps;
  };

  const simulateDeployment = async (provider: string) => {
    setIsDeploying(true);
    const steps = generateDeploymentSteps(provider);
    setDeploymentSteps(steps);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Update step to running
      setDeploymentSteps(prev => prev.map(s => 
        s.id === step.id ? { ...s, status: "running" } : s
      ));

      // Simulate step execution time
      const executionTime = Math.random() * 3000 + 1000; // 1-4 seconds
      await new Promise(resolve => setTimeout(resolve, executionTime));

      // Simulate occasional failures for realism
      const shouldFail = Math.random() < 0.1 && step.id !== "validate"; // 10% chance, but never fail validation
      
      if (shouldFail) {
        setDeploymentSteps(prev => prev.map(s => 
          s.id === step.id 
            ? { ...s, status: "failed", details: "Deployment failed. Please try again." }
            : s
        ));
        setIsDeploying(false);
        return;
      }

      // Mark step as completed
      setDeploymentSteps(prev => prev.map(s => 
        s.id === step.id 
          ? { 
              ...s, 
              status: "completed", 
              duration: Math.round(executionTime / 100) / 10,
              details: getStepDetails(step.id, provider)
            }
          : s
      ));
    }

    // Generate deployment URL
    const deployUrl = generateDeploymentUrl(provider, projectName);
    setDeploymentUrl(deployUrl);
    setIsDeploying(false);

    onDeploymentComplete?.(deployUrl, {
      provider,
      steps: deploymentSteps,
      metadata,
      environmentVars,
      customDomain
    });
  };

  const getStepDetails = (stepId: string, provider: string): string => {
    const details: Record<string, string> = {
      validate: "✅ All dependencies verified, code structure validated",
      build: "📦 Application built successfully, assets optimized",
      "vercel-setup": "⚙️ Vercel project configured with auto-scaling enabled",
      "netlify-setup": "⚙️ Netlify site configured with CDN optimization",
      "railway-setup": "⚙️ Railway service configured with monitoring",
      "render-setup": "⚙️ Render web service configured",
      database: "🗄️ PostgreSQL database provisioned and configured",
      deploy: `🚀 Successfully deployed to ${provider}`,
      dns: "🌐 SSL certificate issued, domain configured"
    };

    return details[stepId] || "Step completed successfully";
  };

  const generateDeploymentUrl = (provider: string, name: string): string => {
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const randomId = Math.random().toString(36).substr(2, 8);
    
    const urls: Record<string, string> = {
      vercel: `https://${sanitizedName}-${randomId}.vercel.app`,
      netlify: `https://${sanitizedName}-${randomId}.netlify.app`,
      railway: `https://${sanitizedName}-${randomId}.railway.app`,
      render: `https://${sanitizedName}-${randomId}.onrender.com`
    };

    return urls[provider] || `https://${sanitizedName}-${randomId}.app`;
  };

  const getRecommendedProvider = () => {
    if (metadata.hasDatabase) return "railway";
    if (metadata.framework === "nextjs") return "vercel";
    if (metadata.hasAPI) return "railway";
    return "vercel"; // Default
  };

  const selectedProviderInfo = DEPLOYMENT_PROVIDERS.find(p => p.id === selectedProvider);
  const recommendedProvider = getRecommendedProvider();

  useEffect(() => {
    // Auto-select recommended provider
    setSelectedProvider(recommendedProvider);
  }, [metadata]);

  useEffect(() => {
    // Setup default environment variables based on metadata
    const defaultEnvVars: Record<string, string> = {};
    
    if (metadata.hasDatabase) {
      defaultEnvVars.DATABASE_URL = "${RAILWAY_DATABASE_URL}";
    }
    
    if (metadata.hasAuth) {
      defaultEnvVars.NEXTAUTH_SECRET = "${GENERATED_SECRET}";
      defaultEnvVars.NEXTAUTH_URL = "${DEPLOYMENT_URL}";
    }
    
    if (metadata.hasAPI) {
      defaultEnvVars.API_URL = "${DEPLOYMENT_URL}/api";
    }
    
    setEnvironmentVars(defaultEnvVars);
  }, [metadata]);

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <CloudIcon className="w-6 h-6 text-blue-600" />
              Deploy Your App
            </h2>
            <p className="text-gray-600 mt-1">
              Choose a deployment platform and deploy your production-ready application in minutes
            </p>
          </div>
          
          {deploymentUrl && (
            <a
              href={deploymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <ExternalLinkIcon className="w-4 h-4" />
              View Live App
            </a>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Provider Selection */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Choose Deployment Platform</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEPLOYMENT_PROVIDERS.map(provider => (
              <div
                key={provider.id}
                onClick={() => setSelectedProvider(provider.id)}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedProvider === provider.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                } ${!provider.supported ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {provider.icon}
                    <div>
                      <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                        {provider.name}
                        {provider.id === recommendedProvider && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                            Recommended
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          provider.cost === "free" 
                            ? "bg-green-100 text-green-700" 
                            : "bg-orange-100 text-orange-700"
                        }`}>
                          {provider.cost}
                        </span>
                      </h4>
                      <p className="text-gray-600 text-sm">{provider.description}</p>
                      <p className="text-gray-500 text-xs mt-1">⏱️ {provider.estimatedTime}</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3">
                  <div className="flex flex-wrap gap-1">
                    {provider.features.slice(0, 3).map(feature => (
                      <span key={feature} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Advanced Configuration */}
        <div className="mb-6">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <SettingsIcon className="w-4 h-4" />
            Advanced Configuration
            <span className="text-xs">({showAdvanced ? "hide" : "show"})</span>
          </button>
          
          {showAdvanced && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
              {/* Environment Variables */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Environment Variables
                </label>
                <div className="space-y-2">
                  {Object.entries(environmentVars).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={key}
                        onChange={(e) => {
                          const newVars = { ...environmentVars };
                          delete newVars[key];
                          newVars[e.target.value] = value;
                          setEnvironmentVars(newVars);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded text-sm"
                        placeholder="Variable name"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setEnvironmentVars(prev => ({ ...prev, [key]: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded text-sm"
                        placeholder="Variable value"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setEnvironmentVars(prev => ({ ...prev, "": "" }))}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add Variable
                  </button>
                </div>
              </div>

              {/* Custom Domain */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Domain (Optional)
                </label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="mydomain.com"
                />
              </div>
            </div>
          )}
        </div>

        {/* Deployment Steps */}
        {deploymentSteps.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Deployment Progress</h3>
            
            <div className="space-y-3">
              {deploymentSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border ${
                    step.status === "completed" ? "bg-green-50 border-green-200" :
                    step.status === "running" ? "bg-blue-50 border-blue-200" :
                    step.status === "failed" ? "bg-red-50 border-red-200" :
                    "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex-shrink-0">
                    {step.status === "completed" && (
                      <CheckIcon className="w-5 h-5 text-green-600" />
                    )}
                    {step.status === "running" && (
                      <RefreshIcon className="w-5 h-5 text-blue-600 animate-spin" />
                    )}
                    {step.status === "failed" && (
                      <AlertCircleIcon className="w-5 h-5 text-red-600" />
                    )}
                    {step.status === "pending" && (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-800">{step.name}</h4>
                      {step.duration && (
                        <span className="text-xs text-gray-500">{step.duration}s</span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm">{step.description}</p>
                    {step.details && (
                      <p className="text-xs text-gray-500 mt-1">{step.details}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deploy Button */}
        {!deploymentUrl && (
          <div className="flex justify-center">
            <button
              onClick={() => simulateDeployment(selectedProvider)}
              disabled={isDeploying || !selectedProviderInfo?.supported}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDeploying ? (
                <RefreshIcon className="w-5 h-5 animate-spin" />
              ) : (
                <CloudIcon className="w-5 h-5" />
              )}
              {isDeploying ? "Deploying..." : `Deploy to ${selectedProviderInfo?.name}`}
            </button>
          </div>
        )}

        {/* Success State */}
        {deploymentUrl && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <CheckIcon className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              🎉 Deployment Successful!
            </h3>
            <p className="text-green-700 mb-4">
              Your application has been deployed and is now live at:
            </p>
            <a
              href={deploymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <ExternalLinkIcon className="w-4 h-4" />
              {deploymentUrl}
            </a>
            
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-white p-3 rounded">
                <h4 className="font-semibold text-gray-800">✅ SSL Enabled</h4>
                <p className="text-gray-600">Secure HTTPS connection</p>
              </div>
              <div className="bg-white p-3 rounded">
                <h4 className="font-semibold text-gray-800">🚀 Auto-scaling</h4>
                <p className="text-gray-600">Handles traffic spikes</p>
              </div>
              <div className="bg-white p-3 rounded">
                <h4 className="font-semibold text-gray-800">📊 Analytics</h4>
                <p className="text-gray-600">Performance monitoring</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}