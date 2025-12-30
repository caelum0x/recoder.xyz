'use client';

import Link from 'next/link';
import { 
  CheckCircle, Star, Download, ArrowRight, Zap, Shield, 
  Code, Database, Cloud, Smartphone, Globe, Settings
} from 'lucide-react';

export default function IntegrationsPage() {
  const featuredIntegrations = [
    {
      id: 1,
      name: "GitHub",
      description: "Seamlessly connect your repositories and enable AI-powered code analysis and generation directly from your GitHub workflow.",
      icon: "github",
      category: "Version Control",
      features: ["Repository syncing", "PR automation", "Code review AI", "Branch management"],
      installs: "50K+",
      rating: 4.9,
      verified: true,
      comingSoon: false
    },
    {
      id: 2,
      name: "VS Code",
      description: "Bring Recoder's AI capabilities directly to your favorite editor with our comprehensive VS Code extension.",
      icon: "vscode",
      category: "Editors",
      features: ["Inline suggestions", "Code completion", "Error fixing", "Refactoring"],
      installs: "25K+",
      rating: 4.8,
      verified: true,
      comingSoon: false
    },
    {
      id: 3,
      name: "Vercel",
      description: "Deploy your AI-generated applications instantly to Vercel with optimized configurations and automatic scaling.",
      icon: "vercel",
      category: "Deployment",
      features: ["One-click deploy", "Auto scaling", "Edge functions", "Analytics"],
      installs: "15K+",
      rating: 4.9,
      verified: true,
      comingSoon: false
    }
  ];

  const integrationCategories = [
    {
      name: "Version Control",
      icon: Code,
      color: "from-blue-500 to-blue-600",
      integrations: [
        { name: "GitHub", installs: "50K+", verified: true },
        { name: "GitLab", installs: "12K+", verified: true },
        { name: "Bitbucket", installs: "8K+", verified: false },
        { name: "Azure DevOps", installs: "5K+", verified: true }
      ]
    },
    {
      name: "Cloud Platforms",
      icon: Cloud,
      color: "from-purple-500 to-purple-600",
      integrations: [
        { name: "AWS", installs: "30K+", verified: true },
        { name: "Google Cloud", installs: "25K+", verified: true },
        { name: "Azure", installs: "20K+", verified: true },
        { name: "DigitalOcean", installs: "10K+", verified: false }
      ]
    },
    {
      name: "Databases",
      icon: Database,
      color: "from-green-500 to-green-600",
      integrations: [
        { name: "PostgreSQL", installs: "22K+", verified: true },
        { name: "MongoDB", installs: "18K+", verified: true },
        { name: "MySQL", installs: "15K+", verified: true },
        { name: "Redis", installs: "12K+", verified: false }
      ]
    },
    {
      name: "Deployment",
      icon: Zap,
      color: "from-orange-500 to-orange-600",
      integrations: [
        { name: "Vercel", installs: "15K+", verified: true },
        { name: "Netlify", installs: "12K+", verified: true },
        { name: "Railway", installs: "8K+", verified: false },
        { name: "Heroku", installs: "10K+", verified: true }
      ]
    },
    {
      name: "Monitoring",
      icon: Shield,
      color: "from-red-500 to-red-600",
      integrations: [
        { name: "Sentry", installs: "18K+", verified: true },
        { name: "DataDog", installs: "15K+", verified: true },
        { name: "LogRocket", installs: "8K+", verified: false },
        { name: "New Relic", installs: "12K+", verified: true }
      ]
    },
    {
      name: "Communication",
      icon: Globe,
      color: "from-indigo-500 to-indigo-600",
      integrations: [
        { name: "Slack", installs: "28K+", verified: true },
        { name: "Discord", installs: "15K+", verified: true },
        { name: "Microsoft Teams", installs: "20K+", verified: true },
        { name: "Zoom", installs: "10K+", verified: false }
      ]
    }
  ];

  const customIntegrations = [
    {
      title: "REST API Integration",
      description: "Connect any service with our flexible REST API integration framework.",
      features: ["Custom endpoints", "Authentication handling", "Data transformation", "Error handling"]
    },
    {
      title: "Webhook Support",
      description: "Real-time data synchronization with webhook-based integrations.",
      features: ["Event triggers", "Payload customization", "Retry logic", "Security headers"]
    },
    {
      title: "SDK Development",
      description: "Build custom integrations with our comprehensive development SDK.",
      features: ["Multi-language support", "Type definitions", "Documentation", "Testing tools"]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
            Integrations
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Connect Recoder with your favorite tools and services. Streamline your development workflow 
            with powerful integrations that enhance your AI-powered coding experience.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105">
              Browse All Integrations
            </button>
            <button className="px-8 py-3 border border-gray-300 dark:border-slate-600 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200">
              Request Integration
            </button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl lg:text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">150+</div>
              <div className="text-gray-600 dark:text-gray-300">Available Integrations</div>
            </div>
            <div className="text-center">
              <div className="text-3xl lg:text-4xl font-bold text-purple-600 dark:text-purple-400 mb-2">500K+</div>
              <div className="text-gray-600 dark:text-gray-300">Total Installs</div>
            </div>
            <div className="text-center">
              <div className="text-3xl lg:text-4xl font-bold text-green-600 dark:text-green-400 mb-2">99.9%</div>
              <div className="text-gray-600 dark:text-gray-300">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-3xl lg:text-4xl font-bold text-orange-600 dark:text-orange-400 mb-2">4.8</div>
              <div className="text-gray-600 dark:text-gray-300">Average Rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Integrations */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
            Featured Integrations
          </h2>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {featuredIntegrations.map((integration) => (
              <div 
                key={integration.id}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold">
                    {integration.name.charAt(0)}
                  </div>
                  {integration.verified && (
                    <div className="flex items-center px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded-full text-xs font-medium">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </div>
                  )}
                </div>
                
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {integration.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {integration.description}
                </p>
                
                <div className="space-y-2 mb-6">
                  {integration.features.map((feature, index) => (
                    <div key={index} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
                
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <Star className="w-4 h-4 text-yellow-400 mr-1" />
                      <span className="text-sm font-medium">{integration.rating}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <Download className="w-4 h-4 mr-1" />
                      {integration.installs}
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-full text-xs">
                    {integration.category}
                  </span>
                </div>
                
                <button className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200">
                  Install Integration
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integration Categories */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-12 text-center">
            Browse by Category
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {integrationCategories.map((category, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300"
              >
                <div className={`h-2 bg-gradient-to-r ${category.color}`} />
                
                <div className="p-6">
                  <div className="flex items-center mb-4">
                    <div className={`w-12 h-12 bg-gradient-to-r ${category.color} rounded-lg flex items-center justify-center mr-4`}>
                      <category.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      {category.name}
                    </h3>
                  </div>
                  
                  <div className="space-y-3">
                    {category.integrations.map((integration, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            {integration.name}
                          </span>
                          {integration.verified && (
                            <CheckCircle className="w-4 h-4 text-green-500 ml-2" />
                          )}
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {integration.installs}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <button className="w-full mt-6 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors duration-200">
                    View All {category.name}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Custom Integrations */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Custom Integrations
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Need something specific? Build custom integrations with our developer-friendly tools and APIs.
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {customIntegrations.map((integration, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {integration.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {integration.description}
                </p>
                
                <div className="space-y-2 mb-6">
                  {integration.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
                
                <Link 
                  href="/docs/integrations/custom"
                  className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  Learn More
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 lg:p-12 text-center text-white">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Don't See Your Integration?
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Request a new integration or build your own with our comprehensive developer tools and documentation.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-3 bg-white text-blue-600 rounded-xl font-medium hover:bg-gray-50 transition-colors duration-200">
                Request Integration
              </button>
              <button className="px-8 py-3 border border-white/30 rounded-xl font-medium hover:bg-white/10 transition-colors duration-200">
                View Developer Docs
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
