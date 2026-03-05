'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Globe, Key, AlertCircle, X } from 'lucide-react';
import { useSession } from '@/lib/session-provider';
import { getRecoderWebUrlClient } from '@/lib/config/platforms';

interface LaunchWebIDEButtonProps {
  className?: string;
  showIcon?: boolean;
  children?: React.ReactNode;
}

export function LaunchWebIDEButton({
  className = "px-4 py-2 text-sm bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg transition-colors flex items-center space-x-2",
  showIcon = true,
  children
}: LaunchWebIDEButtonProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();

    // Check 1: User must be logged in
    if (!session?.user) {
      router.push('/auth/signin?redirect=/');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/user/ai-provider-keys', { credentials: 'include' });

      if (response.status === 401) {
        router.push('/auth/signin?redirect=/settings/ai-providers?redirect=web-ide');
        return;
      }

      const data = response.ok ? await response.json() : { success: false, keys: [] };
      const hasApiKey = Boolean(data.success && data.keys && data.keys.length > 0);

      if (!hasApiKey) {
        setShowModal(true);
        return;
      }
    } catch {
      setShowModal(true);
      return;
    } finally {
      setLoading(false);
    }

    // Non-blocking analytics
    fetch('/api/platform/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'web' }),
    }).catch(() => {});

    // All checks passed - launch the Web IDE directly
    window.location.href = getRecoderWebUrlClient();
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={className}
        disabled={loading}
      >
        {showIcon && <Globe className="w-4 h-4" />}
        <span>{loading ? 'Loading...' : (children || 'Launch Web IDE')}</span>
      </button>

      {/* API Key Required Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg mx-4 p-8 bg-gradient-to-br from-gray-900 to-black border border-orange-500/30 rounded-2xl shadow-2xl">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Key className="w-8 h-8 text-orange-500" />
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-2">API Key Required</h2>
                <p className="text-gray-400">
                  Before using the Web IDE, you need to add your AI provider API key.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-left">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-gray-300">
                    <p className="font-semibold text-white mb-1">Why do I need this?</p>
                    <p>Recoder.xyz is 100% free. You bring your own API key from OpenRouter, Anthropic, or OpenAI. You pay them directly (typically $0.01 per chat) with no markup from us!</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Link
                  href="/settings/ai-providers?redirect=web-ide"
                  onClick={() => setShowModal(false)}
                  className="block w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
                >
                  Add API Key Now
                </Link>
                <button
                  onClick={() => setShowModal(false)}
                  className="block w-full px-6 py-3 border border-white/20 hover:border-white/40 rounded-lg transition-all"
                >
                  Maybe Later
                </button>
              </div>

              <p className="text-xs text-gray-500">
                Need help? Check our <Link href="/docs/api-keys" className="text-orange-500 hover:text-orange-400">API Key Setup Guide</Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
