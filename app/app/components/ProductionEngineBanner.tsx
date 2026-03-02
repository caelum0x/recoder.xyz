'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ProductionEngineBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-teal-600 text-white">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-black bg-opacity-10 backdrop-blur-sm"></div>
      
      {/* Content */}
      <div className="relative container mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* Left Content */}
          <div className="flex-1 text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2 mb-3">
              <Badge className="bg-white text-blue-600 font-semibold">
                🚀 NEW
              </Badge>
              <Badge variant="outline" className="text-white border-white">
                Production Ready
              </Badge>
            </div>
            
            <h2 className="text-2xl lg:text-3xl font-bold mb-2">
              AI-Powered Production Engine
            </h2>
            
            <p className="text-blue-100 text-lg mb-4">
              Generate real, production-ready code with 50+ AI models. Deploy instantly to Vercel, Netlify & more.
            </p>
            
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span>OpenRouter Integration</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span>One-Click Deployment</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span>Team Collaboration</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span>Enterprise Ready</span>
              </div>
            </div>
          </div>
          
          {/* Right Content - CTA */}
          <div className="flex-shrink-0 flex flex-col sm:flex-row gap-3">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold px-8"
              onClick={() => window.location.href = '/dashboard/production'}
            >
              Try Production Engine
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-blue-600 px-8"
              onClick={() => window.location.href = '/dashboard/billing'}
            >
              View Pricing
            </Button>
          </div>
          
          {/* Dismiss Button */}
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-4 right-4 text-white hover:text-blue-200 transition-colors"
            aria-label="Dismiss banner"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Feature Cards */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-white bg-opacity-10 border-white border-opacity-20 text-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl mb-2">🤖</div>
              <div className="font-semibold mb-1">50+ AI Models</div>
              <div className="text-xs text-blue-100">Claude, GPT-4, Gemini & more</div>
            </CardContent>
          </Card>
          
          <Card className="bg-white bg-opacity-10 border-white border-opacity-20 text-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl mb-2">⚡</div>
              <div className="font-semibold mb-1">Instant Deploy</div>
              <div className="text-xs text-blue-100">Vercel, Netlify, GitHub Pages</div>
            </CardContent>
          </Card>
          
          <Card className="bg-white bg-opacity-10 border-white border-opacity-20 text-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl mb-2">👥</div>
              <div className="font-semibold mb-1">Team Ready</div>
              <div className="text-xs text-blue-100">Collaboration & sharing</div>
            </CardContent>
          </Card>
          
          <Card className="bg-white bg-opacity-10 border-white border-opacity-20 text-white">
            <CardContent className="p-4 text-center">
              <div className="text-2xl mb-2">🏢</div>
              <div className="font-semibold mb-1">Enterprise</div>
              <div className="text-xs text-blue-100">SOC 2, on-premise, SLA</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function ProductionEngineFeatureSection() {
  return (
    <section className="py-16 bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-blue-100 text-blue-800">
            Production Engine
          </Badge>
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">
            The Future of AI Development
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Transform your development workflow with our commercial-grade AI engine. 
            Generate real code, deploy instantly, and scale with confidence.
          </p>
        </div>
        
        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🚀</span>
              </div>
              <CardTitle>Multi-AI Integration</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">
                Access 50+ AI models including Claude Sonnet 4, GPT-4, Gemini 2.5 Flash, 
                and DeepSeek V3 through OpenRouter integration.
              </p>
              <Button variant="outline" size="sm">Learn More</Button>
            </CardContent>
          </Card>
          
          {/* Feature 2 */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">⚡</span>
              </div>
              <CardTitle>One-Click Deploy</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">
                Deploy your projects instantly to Vercel, Netlify, GitHub Pages, 
                and more with automated CI/CD pipelines.
              </p>
              <Button variant="outline" size="sm">Try Deploy</Button>
            </CardContent>
          </Card>
          
          {/* Feature 3 */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">👥</span>
              </div>
              <CardTitle>Team Collaboration</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">
                Real-time collaboration, project sharing, and team management 
                with enterprise-grade security features.
              </p>
              <Button variant="outline" size="sm">Start Team</Button>
            </CardContent>
          </Card>
          
          {/* Feature 4 */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🏪</span>
              </div>
              <CardTitle>Template Marketplace</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">
                Browse thousands of production-ready templates or monetize 
                your own creations in our template marketplace.
              </p>
              <Button variant="outline" size="sm">Browse Templates</Button>
            </CardContent>
          </Card>
          
          {/* Feature 5 */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🏢</span>
              </div>
              <CardTitle>Enterprise Ready</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">
                SOC 2 compliance, on-premise deployment, dedicated support, 
                and SLA guarantees for enterprise customers.
              </p>
              <Button variant="outline" size="sm">Contact Sales</Button>
            </CardContent>
          </Card>
          
          {/* Feature 6 */}
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📊</span>
              </div>
              <CardTitle>Advanced Analytics</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">
                Comprehensive usage analytics, cost optimization, 
                and performance insights to maximize your productivity.
              </p>
              <Button variant="outline" size="sm">View Analytics</Button>
            </CardContent>
          </Card>
        </div>
        
        {/* CTA Section */}
        <div className="text-center mt-12">
          <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4">
                Ready to 10x Your Development Speed?
              </h3>
              <p className="text-blue-100 mb-6 text-lg">
                Use our production engine to build faster, deploy easier, and scale better — free during beta.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  className="bg-white text-blue-600 hover:bg-blue-50 px-8"
                  onClick={() => window.location.href = '/dashboard/production'}
                >
                  Start Free Trial
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-white text-white hover:bg-white hover:text-blue-600 px-8"
                  onClick={() => window.location.href = '/dashboard/billing'}
                >
                  View Pricing Plans
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}