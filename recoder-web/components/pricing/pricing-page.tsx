/**
 * Pricing Page Component for Recoder.xyz
 * 
 * Beautiful pricing table with tier comparison and feature highlights
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface PricingTier {
  id: string;
  name: string;
  price: {
    monthly: number;
    yearly: number;
    currency: 'USD';
  };
  limits: {
    monthlyRequests: number;
    monthlyTokens: number;
    costBudget: number;
    concurrentSessions: number;
    contextCacheSize: number;
    reasoningSessions: number;
    agentWorkflows: number;
  };
  features: {
    models: string[];
    agents: string[];
    reasoning: boolean;
    contextCaching: boolean;
    costOptimization: boolean;
    prioritySupport: boolean;
    customIntegrations: boolean;
    teamCollaboration: boolean;
    analytics: boolean;
    apiAccess: boolean;
    whiteLabel: boolean;
    sla: string | null;
  };
  restrictions: {
    modelAccess: 'basic' | 'standard' | 'full';
    responseTime: 'standard' | 'priority' | 'enterprise';
    support: 'community' | 'email' | 'priority' | 'dedicated';
  };
  metadata: {
    popular: boolean;
    targetMargin: number;
    estimatedCost: number;
    description: string;
    cta: string;
  };
}

export default function PricingPage() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [isYearly, setIsYearly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPricingTiers();
  }, []);

  const loadPricingTiers = async () => {
    try {
      const response = await fetch('/api/pricing/tiers');
      if (response.ok) {
        const data = await response.json();
        setTiers(data);
      }
    } catch (error) {
      console.error('Failed to load pricing tiers:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number): string => {
    return price === 0 ? 'Free' : `$${price}`;
  };

  const formatNumber = (num: number): string => {
    if (num === -1) return 'Unlimited';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  const getFeatureIcon = (available: boolean): string => {
    return available ? '✓' : '✗';
  };

  const getFeatureColor = (available: boolean): string => {
    return available ? 'text-green-600' : 'text-gray-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Choose Your AI Development Plan
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          From local models to enterprise-grade AI orchestration. 
          All plans include transparent reasoning, agentic workflows, and cost optimization.
        </p>
        
        {/* Billing Toggle */}
        <div className="flex items-center justify-center space-x-4 mt-8">
          <span className={`font-medium ${!isYearly ? 'text-gray-900' : 'text-gray-500'}`}>
            Monthly
          </span>
          <Switch
            checked={isYearly}
            onCheckedChange={setIsYearly}
            className="data-[state=checked]:bg-blue-600"
          />
          <span className={`font-medium ${isYearly ? 'text-gray-900' : 'text-gray-500'}`}>
            Yearly
          </span>
          <Badge variant="secondary" className="ml-2">
            Save 17%
          </Badge>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
        {tiers.map((tier) => (
          <Card
            key={tier.id}
            className={`relative overflow-hidden transition-all duration-200 hover:shadow-lg ${
              tier.metadata.popular 
                ? 'border-blue-500 shadow-lg scale-105' 
                : 'border-gray-200'
            }`}
          >
            {tier.metadata.popular && (
              <div className="absolute top-0 left-0 right-0 bg-blue-600 text-white text-center py-2 text-sm font-medium">
                Most Popular
              </div>
            )}
            
            <CardHeader className={tier.metadata.popular ? 'pt-12' : 'pt-6'}>
              <div className="text-center space-y-2">
                <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
                <p className="text-gray-600 text-sm">{tier.metadata.description}</p>
                
                <div className="space-y-1">
                  <div className="text-4xl font-bold text-gray-900">
                    {formatPrice(isYearly ? tier.price.yearly : tier.price.monthly)}
                  </div>
                  {tier.price.monthly > 0 && (
                    <div className="text-sm text-gray-500">
                      per {isYearly ? 'year' : 'month'}
                      {isYearly && tier.price.yearly < tier.price.monthly * 12 && (
                        <div className="text-green-600 font-medium">
                          Save ${(tier.price.monthly * 12) - tier.price.yearly}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <Button 
                  className={`w-full mt-4 ${
                    tier.metadata.popular 
                      ? 'bg-blue-600 hover:bg-blue-700' 
                      : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                  size="lg"
                >
                  {tier.metadata.cta}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Usage Limits */}
              <div>
                <h4 className="font-semibold mb-3 text-gray-900">Usage Limits</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Monthly Requests</span>
                    <span className="font-medium">{formatNumber(tier.limits.monthlyRequests)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Monthly Tokens</span>
                    <span className="font-medium">{formatNumber(tier.limits.monthlyTokens)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cost Budget</span>
                    <span className="font-medium">
                      {tier.limits.costBudget === 0 ? 'N/A' : `$${tier.limits.costBudget}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Reasoning Sessions</span>
                    <span className="font-medium">{formatNumber(tier.limits.reasoningSessions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Agent Workflows</span>
                    <span className="font-medium">{formatNumber(tier.limits.agentWorkflows)}</span>
                  </div>
                </div>
              </div>

              {/* AI Models */}
              <div>
                <h4 className="font-semibold mb-3 text-gray-900">AI Models</h4>
                <div className="space-y-1">
                  {tier.features.models.slice(0, 3).map((model, index) => (
                    <div key={index} className="text-sm text-gray-600">
                      ✓ {model.split('/').pop()}
                    </div>
                  ))}
                  {tier.features.models.length > 3 && (
                    <div className="text-sm text-blue-600 font-medium">
                      +{tier.features.models.length - 3} more models
                    </div>
                  )}
                </div>
              </div>

              {/* Key Features */}
              <div>
                <h4 className="font-semibold mb-3 text-gray-900">Features</h4>
                <div className="space-y-2 text-sm">
                  <div className={`flex items-center space-x-2 ${getFeatureColor(tier.features.reasoning)}`}>
                    <span>{getFeatureIcon(tier.features.reasoning)}</span>
                    <span>Transparent Reasoning</span>
                  </div>
                  <div className={`flex items-center space-x-2 ${getFeatureColor(tier.features.contextCaching)}`}>
                    <span>{getFeatureIcon(tier.features.contextCaching)}</span>
                    <span>Context Caching</span>
                  </div>
                  <div className={`flex items-center space-x-2 ${getFeatureColor(tier.features.costOptimization)}`}>
                    <span>{getFeatureIcon(tier.features.costOptimization)}</span>
                    <span>Cost Optimization</span>
                  </div>
                  <div className={`flex items-center space-x-2 ${getFeatureColor(tier.features.analytics)}`}>
                    <span>{getFeatureIcon(tier.features.analytics)}</span>
                    <span>Usage Analytics</span>
                  </div>
                  <div className={`flex items-center space-x-2 ${getFeatureColor(tier.features.apiAccess)}`}>
                    <span>{getFeatureIcon(tier.features.apiAccess)}</span>
                    <span>API Access</span>
                  </div>
                  <div className={`flex items-center space-x-2 ${getFeatureColor(tier.features.teamCollaboration)}`}>
                    <span>{getFeatureIcon(tier.features.teamCollaboration)}</span>
                    <span>Team Collaboration</span>
                  </div>
                </div>
              </div>

              {/* Support & SLA */}
              <div>
                <h4 className="font-semibold mb-3 text-gray-900">Support</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Support Level</span>
                    <span className="font-medium capitalize">{tier.restrictions.support}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Response Time</span>
                    <span className="font-medium capitalize">{tier.restrictions.responseTime}</span>
                  </div>
                  {tier.features.sla && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">SLA</span>
                      <span className="font-medium">{tier.features.sla}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Profit Margin Info (for transparency) */}
              {tier.metadata.targetMargin && (
                <div className="pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Target Margin</span>
                      <span>{Math.round(tier.metadata.targetMargin * 100)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Est. AI Costs</span>
                      <span>${tier.metadata.estimatedCost.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-8">Feature Comparison</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 rounded-lg">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 p-4 text-left font-semibold">Feature</th>
                {tiers.map(tier => (
                  <th key={tier.id} className="border border-gray-200 p-4 text-center font-semibold">
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 p-4 font-medium">AI Models Access</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="border border-gray-200 p-4 text-center">
                    <Badge variant={
                      tier.restrictions.modelAccess === 'full' ? 'default' :
                      tier.restrictions.modelAccess === 'standard' ? 'secondary' : 'outline'
                    }>
                      {tier.restrictions.modelAccess}
                    </Badge>
                  </td>
                ))}
              </tr>
              
              <tr className="bg-gray-50">
                <td className="border border-gray-200 p-4 font-medium">Transparent Reasoning</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="border border-gray-200 p-4 text-center">
                    <span className={getFeatureColor(tier.features.reasoning)}>
                      {getFeatureIcon(tier.features.reasoning)}
                    </span>
                  </td>
                ))}
              </tr>
              
              <tr>
                <td className="border border-gray-200 p-4 font-medium">Agentic Workflows</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="border border-gray-200 p-4 text-center">
                    {tier.features.agents.length > 0 ? (
                      <span className="text-green-600">
                        ✓ ({tier.features.agents.length} agents)
                      </span>
                    ) : (
                      <span className="text-gray-400">✗</span>
                    )}
                  </td>
                ))}
              </tr>
              
              <tr className="bg-gray-50">
                <td className="border border-gray-200 p-4 font-medium">Context Caching</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="border border-gray-200 p-4 text-center">
                    <span className={getFeatureColor(tier.features.contextCaching)}>
                      {getFeatureIcon(tier.features.contextCaching)}
                    </span>
                    {tier.features.contextCaching && (
                      <div className="text-xs text-gray-500 mt-1">
                        {tier.limits.contextCacheSize}MB
                      </div>
                    )}
                  </td>
                ))}
              </tr>
              
              <tr>
                <td className="border border-gray-200 p-4 font-medium">Team Collaboration</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="border border-gray-200 p-4 text-center">
                    <span className={getFeatureColor(tier.features.teamCollaboration)}>
                      {getFeatureIcon(tier.features.teamCollaboration)}
                    </span>
                  </td>
                ))}
              </tr>
              
              <tr className="bg-gray-50">
                <td className="border border-gray-200 p-4 font-medium">White Label</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="border border-gray-200 p-4 text-center">
                    <span className={getFeatureColor(tier.features.whiteLabel)}>
                      {getFeatureIcon(tier.features.whiteLabel)}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        
        <div className="space-y-6">
          <div className="border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">How does cost optimization work?</h3>
            <p className="text-gray-600">
              Our intelligent routing system automatically selects the most cost-effective AI model for each task while maintaining quality. 
              Context caching reduces costs by 50-90% on repeated queries, and our multi-model approach ensures you get the best 
              performance per dollar.
            </p>
          </div>
          
          <div className="border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">What happens if I exceed my limits?</h3>
            <p className="text-gray-600">
              Usage beyond your plan limits is charged at competitive overage rates: $0.001 per request, $2 per million tokens, 
              and 50% markup on actual AI costs. You'll receive warnings before hitting limits and can upgrade anytime.
            </p>
          </div>
          
          <div className="border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">Which AI models are included?</h3>
            <p className="text-gray-600">
              Pro plans include Kimi K2, Qwen 3 Coder, DeepSeek R1, Llama 3.3, and Claude 3.5 Sonnet. 
              Enterprise adds GPT-4, Claude Opus, and Gemini Pro. Free plans use local Ollama models only.
            </p>
          </div>
          
          <div className="border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-2">Can I change plans anytime?</h3>
            <p className="text-gray-600">
              Yes! You can upgrade or downgrade anytime. Upgrades take effect immediately, while downgrades apply at your next billing cycle. 
              Unused time is prorated.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="text-center space-y-4 bg-gray-50 py-12 rounded-lg">
        <h2 className="text-3xl font-bold text-gray-900">Ready to Transform Your Development?</h2>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Join thousands of developers using Recoder.xyz to build real, production-ready applications with AI.
        </p>
        <div className="flex justify-center space-x-4 mt-6">
          <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
            Start Free Trial
          </Button>
          <Button variant="outline" size="lg">
            Schedule Demo
          </Button>
        </div>
      </div>
    </div>
  );
}