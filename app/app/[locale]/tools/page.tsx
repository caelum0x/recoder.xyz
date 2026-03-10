'use client';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import Link from 'next/link';
import { 
  Terminal, Code, Download, Copy, ExternalLink, 
  BookOpen, Zap, Shield, Globe, CheckCircle, 
  ArrowRight, Package, Settings, Monitor, FileCode
} from 'lucide-react';

export default function DeveloperToolsPage() {
  const cliCommands = [
    {
      title: "Install Recoder CLI",
      command: "npm install -g recoder-code",
      description: "Get started with our command-line interface"
    },
    {
      title: "Create New Project",
      command: "recoder create my-app --template react",
      description: "Generate a new project from templates"
    },
    {
      title: "Generate Component",
      command: "recoder generate component Button --props text,onClick",
      description: "AI-powered component generation"
    },
    {
      title: "Deploy Project",
      command: "recoder deploy --platform vercel",
      description: "Deploy your project to any platform"
    }
  ];

  const sdks = [
    {
      name: "JavaScript SDK",
      description: "Full-featured SDK for Node.js and browser environments",
      version: "v2.1.4",
      downloads: "50K+",
      language: "JavaScript",
      icon: "🟨",
      features: ["TypeScript support", "Async/await", "Streaming responses", "Error handling"],
      installCommand: "npm install @recoder/sdk",
      docsLink: "/docs/sdk/javascript"
    },
    {
      name: "Python SDK",
      description: "Pythonic interface for AI-powered code generation",
      version: "v1.8.2",
      downloads: "35K+",
      language: "Python",
      icon: "🐍",
      features: ["Type hints", "Async support", "Context managers", "Jupyter integration"],
      installCommand: "pip install recoder-sdk",
      docsLink: "/docs/sdk/python"
    },
    {
      name: "Go SDK",
      description: "High-performance SDK for Go applications",
      version: "v1.3.1",
      downloads: "15K+",
      language: "Go",
      icon: "🔵",
      features: ["Goroutine support", "Context handling", "Structured logging", "Built-in retries"],
      installCommand: "go get github.com/recoder/go-sdk",
      docsLink: "/docs/sdk/go"
    },
    {
      name: "Rust SDK",
      description: "Safe and fast SDK for Rust developers",
      version: "v0.9.3",
      downloads: "8K+",
      language: "Rust",
      icon: "🦀",
      features: ["Memory safety", "Zero-cost abstractions", "Tokio async", "Serde integration"],
      installCommand: "cargo add recoder-sdk",
      docsLink: "/docs/sdk/rust"
    }
  ];

  const tools = [
    {
      name: "VS Code Extension",
      description: "AI-powered coding assistance directly in your favorite editor",
      category: "Editor Extensions",
      icon: Monitor,
      features: ["Intelligent autocomplete", "Real-time error fixing", "Code refactoring", "Inline documentation"],
      link: "https://marketplace.visualstudio.com/items?itemName=recoder.vscode",
      installs: "100K+",
      rating: 4.8
    },
    {
      name: "API Explorer",
      description: "Interactive tool to test and explore our REST API endpoints",
      category: "Development Tools",
      icon: Globe,
      features: ["Live API testing", "Request/response inspection", "Code generation", "Authentication testing"],
      link: "/tools/api-explorer",
      installs: "25K+",
      rating: 4.9
    },
    {
      name: "Code Formatter",
      description: "Format and optimize AI-generated code for any language",
      category: "Utilities",
      icon: FileCode,
      features: ["Multi-language support", "Custom style rules", "Batch processing", "Integration ready"],
      link: "/tools/formatter",
      installs: "40K+",
      rating: 4.7
    },
    {
      name: "Project Template Generator",
      description: "Generate custom project templates for your specific needs",
      category: "Scaffolding",
      icon: Package,
      features: ["Custom templates", "Dependency management", "Configuration presets", "Team sharing"],
      link: "/tools/template-generator",
      installs: "30K+",
      rating: 4.8
    }
  ];

  const apiEndpoints = [
    {
      method: "POST",
      endpoint: "/v1/generate",
      description: "Generate code from natural language prompts",
      params: ["prompt", "language", "framework", "context"]
    },
    {
      method: "POST",
      endpoint: "/v1/complete",
      description: "Intelligent code completion and suggestions",
      params: ["code", "cursor_position", "language", "preferences"]
    },
    {
      method: "POST",
      endpoint: "/v1/refactor",
      description: "Refactor and optimize existing code",
      params: ["code", "language", "optimization_goals", "constraints"]
    },
    {
      method: "POST",
      endpoint: "/v1/explain",
      description: "Get detailed explanations of code functionality",
      params: ["code", "language", "detail_level", "format"]
    }
  ];

  const getMethodColor = (method: string) => {
    const colors: { [key: string]: string } = {
      "GET": "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300",
      "POST": "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
      "PUT": "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300",
      "DELETE": "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300"
    };
    return colors[method] || "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <SiteHeader />
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-orange-500 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
            Developer Tools
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Everything you need to integrate Recoder's AI-powered development capabilities into your workflow. 
            From CLI tools to SDKs, we've got you covered.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 text-white rounded-xl font-medium hover:from-orange-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105">
              Get Started
            </button>
            <button className="px-8 py-3 border border-gray-300 dark:border-slate-600 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200">
              View Documentation
            </button>
          </div>
        </div>
      </section>

      {/* Quick Start CLI */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Command Line Interface
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Get started quickly with our powerful CLI tool
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {cliCommands.map((cmd, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300"
              >
                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                    {cmd.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    {cmd.description}
                  </p>
                </div>
                
                <div className="bg-gray-900 dark:bg-slate-900 p-4 relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Terminal className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 text-sm">Terminal</span>
                    </div>
                    <button 
                      onClick={() => navigator.clipboard.writeText(cmd.command)}
                      className="text-gray-400 hover:text-white transition-colors duration-200"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <code className="text-white font-mono text-sm">
                    $ {cmd.command}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SDKs Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Software Development Kits
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Integrate Recoder into your applications with our comprehensive SDKs
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {sdks.map((sdk, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <span className="text-3xl mr-3">{sdk.icon}</span>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {sdk.name}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-300">
                        <span>{sdk.version}</span>
                        <span>{sdk.downloads} downloads</span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-md text-xs font-medium">
                    {sdk.language}
                  </span>
                </div>
                
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {sdk.description}
                </p>
                
                <div className="space-y-2 mb-6">
                  {sdk.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
                
                <div className="bg-gray-900 dark:bg-slate-900 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <code className="text-green-400 font-mono text-sm">
                      {sdk.installCommand}
                    </code>
                    <button 
                      onClick={() => navigator.clipboard.writeText(sdk.installCommand)}
                      className="text-gray-400 hover:text-white transition-colors duration-200"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Link 
                    href={sdk.docsLink}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-purple-600 text-white rounded-lg font-medium text-center hover:from-orange-600 hover:to-purple-700 transition-all duration-200"
                  >
                    Documentation
                  </Link>
                  <button className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors duration-200">
                    Examples
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Developer Tools */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Development Tools
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Enhance your development workflow with our specialized tools
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {tools.map((tool, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center mr-4">
                      <tool.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {tool.name}
                      </h3>
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {tool.category}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                    <div>{tool.installs}</div>
                    <div className="flex items-center">
                      ⭐ {tool.rating}
                    </div>
                  </div>
                </div>
                
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {tool.description}
                </p>
                
                <div className="space-y-2 mb-6">
                  {tool.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
                
                <Link 
                  href={tool.link}
                  className="inline-flex items-center w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-purple-600 text-white rounded-lg font-medium text-center justify-center hover:from-orange-600 hover:to-purple-700 transition-all duration-200"
                >
                  {tool.link.startsWith('http') ? 'Download' : 'Try Tool'}
                  <ExternalLink className="ml-2 w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* API Reference */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              API Reference
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Direct access to our powerful AI generation APIs
            </p>
          </div>
          
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Core API Endpoints
                </h3>
                <Link 
                  href="/docs/api"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  Full Documentation →
                </Link>
              </div>
            </div>
            
            <div className="divide-y divide-gray-200 dark:divide-slate-700">
              {apiEndpoints.map((endpoint, index) => (
                <div key={index} className="p-6 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors duration-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getMethodColor(endpoint.method)}`}>
                        {endpoint.method}
                      </span>
                      <code className="text-gray-900 dark:text-white font-mono">
                        {endpoint.endpoint}
                      </code>
                    </div>
                  </div>
                  
                  <p className="text-gray-600 dark:text-gray-300 mb-3">
                    {endpoint.description}
                  </p>
                  
                  <div className="flex flex-wrap gap-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Parameters:</span>
                    {endpoint.params.map((param, idx) => (
                      <code key={idx} className="px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded text-xs">
                        {param}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Getting Started */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-orange-500 to-purple-600 rounded-2xl p-8 lg:p-12 text-center text-white">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Ready to Build Something Amazing?
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Get started with our comprehensive documentation, code examples, and developer resources. 
              Build the next generation of AI-powered applications.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-3 bg-white text-blue-600 rounded-xl font-medium hover:bg-gray-50 transition-colors duration-200">
                View Documentation
              </button>
              <button className="px-8 py-3 border border-white/30 rounded-xl font-medium hover:bg-white/10 transition-colors duration-200">
                Download CLI
              </button>
            </div>
            
            <div className="mt-8 flex items-center justify-center space-x-6 text-sm opacity-75">
              <div className="flex items-center">
                <BookOpen className="w-4 h-4 mr-1" />
                Comprehensive Docs
              </div>
              <div className="flex items-center">
                <Zap className="w-4 h-4 mr-1" />
                Fast Integration
              </div>
              <div className="flex items-center">
                <Shield className="w-4 h-4 mr-1" />
                Enterprise Ready
              </div>
            </div>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
