'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Check, Sparkles, Zap, Shield } from 'lucide-react';

export default function SubscriptionSuccessPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const planId = searchParams.get('plan');
  const [plan, setPlan] = useState<any>(null);

  useEffect(() => {
    // Fetch plan details
    if (planId) {
      fetch('/api/subscription/plans')
        .then(res => res.json())
        .then(data => {
          const selectedPlan = data.plans?.find((p: any) => p.id === planId);
          setPlan(selectedPlan);
        })
        .catch(console.error);
    }
  }, [planId]);

  const features = {
    pro: [
      'Unlimited AI code generation',
      '1,000 CLI requests per month',
      '20 web projects',
      '1,000 chat messages per day',
      '2,000 VS Code suggestions per day',
      '1GB storage',
      'Email support',
      'Advanced AI models'
    ],
    enterprise: [
      'Everything in Pro',
      'Unlimited CLI requests',
      'Unlimited projects',
      'Unlimited chat messages',
      'Unlimited VS Code suggestions',
      '10GB storage',
      'Priority support',
      'Custom AI model training',
      'Team collaboration features',
      'Advanced analytics'
    ]
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🎉 Welcome to Recoder {plan?.name}!
          </h1>
          
          <p className="text-xl text-gray-600 mb-2">
            Your subscription has been activated successfully
          </p>
          
          {session?.user && (
            <p className="text-gray-500">
              Logged in as {session.user.email}
            </p>
          )}
        </div>

        {/* Plan Details */}
        {plan && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  {plan.name === 'PRO' && <Zap className="w-6 h-6 text-blue-600" />}
                  {plan.name === 'ENTERPRISE' && <Shield className="w-6 h-6 text-purple-600" />}
                  Recoder {plan.name}
                </h2>
                <p className="text-gray-600">
                  ${plan.price}/month - Billed monthly
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  <Sparkles className="w-4 h-4 mr-1" />
                  Active
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">What's included:</h3>
                <ul className="space-y-2">
                  {(features[planId as keyof typeof features] || []).map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Quick Start:</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">1</span>
                    <div>
                      <p className="font-medium text-gray-900">Install CLI</p>
                      <code className="text-sm text-gray-600">npm install -g @recoder/cli</code>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">2</span>
                    <div>
                      <p className="font-medium text-gray-900">Install VS Code Extension</p>
                      <p className="text-sm text-gray-600">Search "Recoder" in VS Code Marketplace</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">3</span>
                    <div>
                      <p className="font-medium text-gray-900">Start Coding</p>
                      <p className="text-sm text-gray-600">Generate real, production-ready code</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Dashboard
          </a>
          
          <a
            href="https://web.recoder.xyz"
            className="inline-flex items-center justify-center px-6 py-3 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Start Coding
          </a>
          
          <a
            href="https://docs.recoder.xyz"
            className="inline-flex items-center justify-center px-6 py-3 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            View Documentation
          </a>
        </div>

        {/* Help */}
        <div className="text-center mt-8">
          <p className="text-gray-600">
            Need help getting started?{' '}
            <a 
              href="mailto:support@recoder.xyz" 
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}