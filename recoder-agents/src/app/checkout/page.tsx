'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Script from 'next/script';

function CheckoutContent() {
  const searchParams = useSearchParams();
  const clientSecret = searchParams.get('client_secret');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stripeLoaded, setStripeLoaded] = useState(false);

  // Check if Stripe is already loaded
  useEffect(() => {
    const checkStripe = () => {
      if (typeof window !== 'undefined' && typeof window.Stripe !== 'undefined') {
        setStripeLoaded(true);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkStripe()) return;

    // Keep checking for 5 seconds
    const interval = setInterval(() => {
      if (checkStripe()) {
        clearInterval(interval);
      }
    }, 100);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (typeof window.Stripe === 'undefined') {
        setError('Payment system taking too long to load. Please refresh the page.');
        setIsLoading(false);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!clientSecret) {
      setError('No checkout session provided. Please start the checkout process again.');
      setIsLoading(false);
      return;
    }

    if (!stripeLoaded) {
      return; // Wait for Stripe to load
    }

    // Initialize Stripe checkout
    const initCheckout = async () => {
      try {
        const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!stripeKey) {
          throw new Error('Stripe publishable key is not configured');
        }

        if (typeof window.Stripe === 'undefined') {
          throw new Error('Stripe not loaded on window');
        }

        const stripe = window.Stripe(stripeKey);

        // Initialize embedded checkout
        const checkout = await stripe.initEmbeddedCheckout({
          clientSecret: clientSecret,
        });

        // Stop loading FIRST so the container renders
        setIsLoading(false);

        // Wait for DOM to update, then mount
        setTimeout(() => {
          const container = document.getElementById('checkout-container');

          if (!container) {
            throw new Error('Checkout container not found in DOM');
          }

          checkout.mount('#checkout-container');
        }, 100);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load checkout. Please try again.');
        setIsLoading(false);
      }
    };

    initCheckout();
  }, [clientSecret, stripeLoaded]);

  return (
    <>
      <Script
        src="https://js.stripe.com/v3/"
        onLoad={() => {
          setStripeLoaded(true);
        }}
        onError={() => {
          setError('Failed to load payment system');
          setIsLoading(false);
        }}
        onReady={() => {
          setStripeLoaded(true);
        }}
      />
      
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        {error ? (
          <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
            <CardHeader className="text-center">
              <CardTitle className="text-zinc-100">Checkout Error</CardTitle>
              <CardDescription className="text-zinc-400">Unable to load checkout</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertDescription className="text-center">
                  {error}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <RecoderLoader size="xlarge" />
            <p className="text-zinc-400 text-sm">Loading secure checkout...</p>
          </div>
        ) : (
          // Embedded checkout container
          <div className="w-full max-w-4xl">
            <div id="checkout-container"></div>
          </div>
        )}
      </div>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RecoderLoader size="large" forceTheme="dark" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}

