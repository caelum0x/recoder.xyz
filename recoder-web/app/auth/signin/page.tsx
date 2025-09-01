"use client";

// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';

import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FaGithub, FaGoogle } from "react-icons/fa";
import { AlertCircle, Loader2, ArrowLeft } from "lucide-react";

interface Provider {
  id: string;
  name: string;
  type: string;
  signinUrl: string;
  callbackUrl: string;
}

export default function SignIn() {
  const [providers, setProviders] = useState<Record<string, Provider> | null>(null);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/";
  const errorParam = searchParams?.get("error");

  useEffect(() => {
    const fetchProviders = async () => {
      const res = await getProviders();
      setProviders(res);
    };
    fetchProviders();
  }, []);

  useEffect(() => {
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        Signin: "Try signing in with a different account.",
        OAuthSignin: "Try signing in with a different account.",
        OAuthCallback: "Try signing in with a different account.",
        OAuthCreateAccount: "Try signing in with a different account.",
        EmailCreateAccount: "Try signing in with a different account.",
        Callback: "Try signing in with a different account.",
        OAuthAccountNotLinked: "To confirm your identity, sign in with the same account you used originally.",
        EmailSignin: "The e-mail could not be sent.",
        CredentialsSignin: "Sign in failed. Check the details you provided are correct.",
        SessionRequired: "Please sign in to access this page.",
        default: "Unable to sign in."
      };
      setError(errorMessages[errorParam] || errorMessages.default);
    }
  }, [errorParam]);

  const handleSignIn = async (providerId: string) => {
    setIsLoading(providerId);
    setError(null);
    
    try {
      const result = await signIn(providerId, {
        callbackUrl,
        redirect: false,
      });
      
      if (result?.error) {
        setError("Sign in failed. Please try again.");
      } else if (result?.url) {
        router.push(result.url);
      }
    } catch (error) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(null);
    }
  };

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case "github":
        return <FaGithub className="w-5 h-5" />;
      case "google":
        return <FaGoogle className="w-5 h-5" />;
      default:
        return null;
    }
  };

  const getProviderStyle = (providerId: string) => {
    switch (providerId) {
      case "github":
        return "bg-gray-900 hover:bg-gray-800 text-white";
      case "google":
        return "bg-white hover:bg-gray-50 text-gray-900 border border-gray-300";
      default:
        return "bg-blue-600 hover:bg-blue-700 text-white";
    }
  };

  if (!providers) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Recoder
          </Link>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Recoder
          </h1>
          <p className="text-gray-600">
            Sign in to access AI-powered code generation with multi-AI intelligence
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Sign in failed</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Sign In Options */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="space-y-4">
            {Object.values(providers).map((provider) => (
              <button
                key={provider.name}
                onClick={() => handleSignIn(provider.id)}
                disabled={isLoading === provider.id}
                className={`
                  w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-medium
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  ${getProviderStyle(provider.id)}
                `}
              >
                {isLoading === provider.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  getProviderIcon(provider.id)
                )}
                {isLoading === provider.id ? "Signing in..." : `Continue with ${provider.name}`}
              </button>
            ))}
          </div>

          {/* Features */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">What you get with Recoder:</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                Multi-AI intelligence (Claude, Groq, Gemini)
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                Real, production-ready code generation
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                Advanced code execution environment
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                One-click deployment pipeline
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                Personal chat history and projects
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          By signing in, you agree to our{" "}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}

export const runtime = "edge";