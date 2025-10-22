/**
 * AppHeader Component
 * Unified header with theme toggle and notifications
 */

'use client';

import Link from 'next/link';
import { Terminal } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { NotificationCenter } from './NotificationCenter';

interface AppHeaderProps {
  showBackButton?: boolean;
  backHref?: string;
  backLabel?: string;
}

export function AppHeader({ showBackButton = false, backHref = '/dashboard', backLabel = 'Back to Dashboard' }: AppHeaderProps) {
  return (
    <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left side */}
        {showBackButton ? (
          <Link href={backHref} className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>{backLabel}</span>
          </Link>
        ) : (
          <div className="w-32" /> // Spacer
        )}

        {/* Center - Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold">recoder</span>
        </Link>

        {/* Right side - Controls */}
        <div className="flex items-center space-x-2">
          <ThemeToggle />
          <NotificationCenter />
        </div>
      </div>
    </header>
  );
}
