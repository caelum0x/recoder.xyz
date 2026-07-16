'use client';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import Link from 'next/link';
import { MessageSquare, ArrowRight } from 'lucide-react';

export default function TestimonialsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="container mx-auto max-w-3xl px-6 py-24 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-8">
          <MessageSquare className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-bold mb-4">Customer Stories</h1>
        <p className="text-xl text-gray-400 mb-8">
          Recoder is currently in beta. We&apos;re working with early adopters to build the
          best AI development platform possible.
        </p>
        <p className="text-gray-500 mb-12">
          If you&apos;re using Recoder and want to share your experience, we&apos;d love to hear from you.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/signup"
            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Join the Beta
          </Link>
          <Link
            href="/contact"
            className="px-8 py-3 border border-white/10 hover:border-white/20 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
          >
            <span>Share Your Story</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
