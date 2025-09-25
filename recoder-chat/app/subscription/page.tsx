'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import SubscriptionManager from '@/components/subscription/SubscriptionManager';
import { usePaymentStore } from '@/lib/payment-service';

function SubscriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshData } = usePaymentStore();
  
  // Check for payment success/failure
  const status = searchParams.get('status');
  const subscriptionId = searchParams.get('subscription_id');
  const error = searchParams.get('error');

  useEffect(() => {
    // Refresh subscription data when returning from payment
    if (status === 'success' || status === 'cancelled') {
      refreshData();
    }
  }, [status, refreshData]);

  // Show payment result if coming back from payment flow
  if (status) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push('/subscription')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Subscriptions
          </Button>
        </div>

        <Card>
          <CardHeader className="text-center">
            {status === 'success' ? (
              <>
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <CardTitle className="text-2xl text-green-800">Payment Successful!</CardTitle>
                <CardDescription>
                  Your subscription has been activated successfully.
                </CardDescription>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                <CardTitle className="text-2xl text-red-800">Payment Failed</CardTitle>
                <CardDescription>
                  {error || 'There was an issue processing your payment.'}
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent className="text-center space-y-4">
            {status === 'success' ? (
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-800">
                  {subscriptionId && (
                    <div className="mb-2">
                      <strong>Subscription ID:</strong> {subscriptionId}
                    </div>
                  )}
                  You now have access to all Recoder features. Start building with AI!
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-800">
                  Don't worry - you can try again or contact support if the problem persists.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="flex gap-4 justify-center">
              <Button onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </Button>
              {status !== 'success' && (
                <Button variant="outline" onClick={() => router.push('/subscription')}>
                  Try Again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main subscription management interface
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Subscription Management
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Manage your Recoder subscription, monitor usage, and upgrade your plan.
        </p>
      </div>

      <SubscriptionManager />
      
      {/* Additional Features */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Multi-Platform Access</CardTitle>
            <CardDescription>
              Your subscription works across all Recoder platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 text-gray-600">
              <li>• Web Platform (recoder.xyz)</li>
              <li>• CLI Tool (npm install -g recoder)</li>
              <li>• VS Code Extension</li>
              <li>• Desktop Application</li>
              <li>• Mobile Apps (Coming Soon)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Provider Access</CardTitle>
            <CardDescription>
              Connect to the best AI models for development
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 text-gray-600">
              <li>• Anthropic Claude (Best for reasoning)</li>
              <li>• Google Gemini (Multimodal)</li>
              <li>• Groq (Ultra-fast inference)</li>
              <li>• DeepSeek (Cost-effective coding)</li>
              <li>• OpenAI (General purpose)</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Enterprise Features</CardTitle>
            <CardDescription>
              Advanced features for professional development
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 text-gray-600">
              <li>• Real-time collaboration</li>
              <li>• Advanced security scanning</li>
              <li>• Custom model fine-tuning</li>
              <li>• White-label solutions</li>
              <li>• Dedicated support</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div></div>}>
      <SubscriptionContent />
    </Suspense>
  );
}