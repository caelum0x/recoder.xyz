"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GoodbyePage() {
  useEffect(() => {
    // Clear any remaining local storage or session data
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center bg-white rounded-lg shadow-lg p-8">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">👋</span>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Account Successfully Deleted
        </h1>
        
        <p className="text-gray-600 mb-6">
          Your Recoder.xyz account and all associated data have been permanently deleted. 
          We're sorry to see you go, and we hope you'll consider joining us again in the future.
        </p>
        
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            If you change your mind, you can always create a new account.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Return to Homepage
            </Link>
            
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Create New Account
            </Link>
          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-400">
            Need help? Contact our support team at{" "}
            <a 
              href="mailto:support@recoder.xyz" 
              className="text-indigo-600 hover:underline"
            >
              support@recoder.xyz
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export const runtime = "edge";
