import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Check, 
  Zap, 
  Star, 
  Crown, 
  Building,
  ArrowRight,
  Sparkles,
  MessageSquare,
  Code2,
  Globe,
  Terminal
} from 'lucide-react';

export default function PricingPage() {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'USD',
      period: 'forever',
      description: 'Perfect for trying out Recoder and small personal projects',
      icon: Code2,
      badge: null,
      popular: false,
      features: [
        '10k AI tokens per month',
        '100 API calls per month',
        '2 deployments per month',
        'Community support',
        'Basic templates',
        'CLI access',
        'Web platform access'
      ],
      limitations: [
        'Limited AI model access',
        'Basic deployment options',
        'Community support only'
      ],
      cta: 'Get Started Free',
      href: '/auth/signin'
    },
    {
      id: 'weekly',
      name: 'Recoder Weekly',
      price: 10,
      currency: 'USD',
      period: 'week',
      description: 'Great for freelancers and short-term projects',
      icon: Zap,
      badge: { text: 'Popular', color: 'bg-blue-500' },
      popular: true,
      features: [
        '500k AI tokens per week',
        '5k API requests per week',
        'Multi-provider AI access (Claude, Groq, Gemini)',
        'Real-time collaboration',
        'Basic support',
        'All templates',
        'GitHub integration',
        '20 deployments per week',
        'Up to 3 team members'
      ],
      limitations: [],
      cta: 'Start Weekly Plan',
      href: '/auth/signin?plan=weekly'
    },
    {
      id: 'monthly',
      name: 'Recoder Monthly',
      price: 20,
      currency: 'USD',
      period: 'month',
      description: 'Best value for regular development work and small teams',
      icon: Star,
      badge: { text: 'Best Value', color: 'bg-green-500' },
      popular: false,
      features: [
        '2.5M AI tokens per month',
        '25k API requests per month',
        'Multi-provider AI access (Claude, Groq, Gemini)',
        'Real-time collaboration',
        'Priority support',
        'Custom templates',
        'Team collaboration',
        'Advanced analytics',
        '100 deployments per month',
        'Up to 10 team members',
        'Advanced security features'
      ],
      limitations: [],
      cta: 'Start Monthly Plan',
      href: '/auth/signin?plan=monthly'
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 499,
      currency: 'USD',
      period: 'month',
      description: 'For large teams and organizations with advanced needs',
      icon: Building,
      badge: { text: 'Enterprise', color: 'bg-purple-500' },
      popular: false,
      features: [
        'Unlimited AI tokens',
        'Unlimited API calls',
        'Unlimited deployments',
        'Dedicated support team',
        'On-premise deployment options',
        'Custom integrations',
        'White-label options',
        'SLA guarantees',
        'Advanced security & compliance',
        'Unlimited team members',
        'Custom AI model training',
        'Priority feature requests'
      ],
      limitations: [],
      cta: 'Contact Sales',
      href: '/contact?plan=enterprise'
    }
  ];

  const features = [
    {
      icon: Terminal,
      title: 'CLI Tools',
      description: 'Powerful command-line interface with natural language processing'
    },
    {
      icon: Globe,
      title: 'Web Platform',
      description: 'Browser-based development environment with real-time collaboration'
    },
    {
      icon: MessageSquare,
      title: 'AI Chat',
      description: 'Intelligent chat interface for code discussions and assistance'
    },
    {
      icon: Code2,
      title: 'VS Code Extension',
      description: 'Seamless integration with your favorite code editor'
    },
    {
      icon: Zap,
      title: 'Multi-AI Integration',
      description: 'Access to 15+ AI models including Claude, GPT-4, and Gemini'
    },
    {
      icon: Crown,
      title: 'Production Ready',
      description: 'Generate real, deployable code - not just prototypes'
    }
  ];

  const faqs = [
    {
      question: 'What AI models do you support?',
      answer: 'We support 15+ AI models including Claude Sonnet 4, GPT-4, Gemini 2.5 Flash, Groq Llama, and many more through our OpenRouter integration.'
    },
    {
      question: 'Can I cancel my subscription anytime?',
      answer: 'Yes, you can cancel your subscription at any time. There are no cancellation fees, and you\'ll retain access until the end of your billing period.'
    },
    {
      question: 'Do you offer refunds?',
      answer: 'We offer a 7-day money-back guarantee for all paid plans. If you\'re not satisfied, contact us within 7 days for a full refund.'
    },
    {
      question: 'Is there a free trial?',
      answer: 'Yes! Our Free plan gives you access to all core features with usage limits. You can upgrade anytime as your needs grow.'
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards, PayPal, and bank transfers. All payments are processed securely through Dodo Pay.'
    },
    {
      question: 'Do you offer volume discounts?',
      answer: 'Yes, we offer custom pricing for large teams and enterprises. Contact our sales team to discuss volume discounts.'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Header */}
      <section className="pt-20 pb-16 px-4">
        <div className="container mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Simple, Transparent Pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Choose Your Perfect Plan
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto">
            Start building with AI-powered development tools. Scale as you grow with flexible pricing that matches your needs.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
            {plans.map((plan, index) => {
              const Icon = plan.icon;
              return (
                <Card 
                  key={plan.id} 
                  className={`relative group hover:shadow-lg transition-all duration-300 ${
                    plan.popular ? 'ring-2 ring-blue-500 scale-105' : ''
                  }`}
                >
                  {plan.badge && (
                    <div className={`absolute -top-3 left-1/2 transform -translate-x-1/2 ${plan.badge.color} text-white px-3 py-1 rounded-full text-sm font-semibold`}>
                      {plan.badge.text}
                    </div>
                  )}
                  
                  <CardHeader className="text-center">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription className="text-sm">{plan.description}</CardDescription>
                    
                    <div className="mt-4">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-sm text-slate-600 dark:text-slate-300">$</span>
                        <span className="text-4xl font-bold">{plan.price}</span>
                        <span className="text-sm text-slate-600 dark:text-slate-300">/{plan.period}</span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <Button 
                      size="lg" 
                      className={`w-full mb-6 ${plan.popular ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                      asChild
                    >
                      <Link href={plan.href}>
                        {plan.cta}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>

                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">What's included:</p>
                      {plan.features.map((feature, featureIndex) => (
                        <div key={featureIndex} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-slate-600 dark:text-slate-300">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Overview */}
      <section className="py-20 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Everything You Need to Build</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              All plans include access to our comprehensive development ecosystem
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={index} className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-slate-600 dark:text-slate-300">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Frequently Asked Questions</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Got questions? We've got answers.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {faqs.map((faq, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{faq.question}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600 dark:text-slate-300">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Start Building?</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
            Join thousands of developers building faster and smarter with AI-powered tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/auth/signin" className="flex items-center gap-2">
                <span>Start Free Trial</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600" asChild>
              <Link href="/contact" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span>Contact Sales</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}