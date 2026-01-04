'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Terminal, Key, Eye, EyeOff, CheckCircle2, Loader2, ExternalLink, Trash2, Shield, Zap } from 'lucide-react';

interface ClaudeCodeStatus {
  hasToken: boolean;
  tokenMasked: string | null;
}

export default function ClaudeCodeSettingsPage() {
  const [status, setStatus] = useState<ClaudeCodeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      // Get user ID from session
      const sessionRes = await fetch('/api/auth/session');
      const session = await sessionRes.json();

      if (!session?.user?.id) {
        setError('Please sign in to manage Claude Code settings');
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/user/claude-code?userId=${session.user.id}`);
      const data = await response.json();

      if (response.ok) {
        setStatus(data);
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch (err) {
      console.error('Failed to fetch Claude Code status:', err);
      setError('Failed to load Claude Code status');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      // Get user ID from session
      const sessionRes = await fetch('/api/auth/session');
      const session = await sessionRes.json();

      if (!session?.user?.id) {
        setError('Please sign in to save Claude Code token');
        setSubmitting(false);
        return;
      }

      const response = await fetch('/api/user/claude-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          token: token
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(data.message);
        setToken('');
        fetchStatus();
      } else {
        setError(data.error || 'Failed to save token');
      }
    } catch (err) {
      setError('Failed to save Claude Code token');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteToken = async () => {
    if (!confirm('Are you sure you want to remove your Claude Code token?')) return;

    try {
      const sessionRes = await fetch('/api/auth/session');
      const session = await sessionRes.json();

      if (!session?.user?.id) {
        setError('Please sign in');
        return;
      }

      const response = await fetch(`/api/user/claude-code?userId=${session.user.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess('Claude Code token removed');
        fetchStatus();
      } else {
        setError(data.error || 'Failed to remove token');
      }
    } catch (err) {
      setError('Failed to remove token');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading Claude Code settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/settings" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Settings</span>
          </Link>
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-3xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
                <Terminal className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Claude Code Integration</h1>
                <p className="text-gray-400">
                  Use your own Claude Pro/Max subscription in recoder containers
                </p>
              </div>
            </div>
          </div>

          {/* Alert Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <span>{success}</span>
            </div>
          )}

          {/* Current Status */}
          {status?.hasToken && (
            <div className="mb-8 p-6 border border-green-500/20 rounded-2xl bg-green-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <div>
                    <h3 className="font-semibold text-green-400">Claude Code Connected</h3>
                    <p className="text-sm text-gray-400 font-mono">{status.tokenMasked}</p>
                  </div>
                </div>
                <button
                  onClick={handleDeleteToken}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Remove token"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-400 mt-3">
                Your Claude Code token is active. Claude Code will use your Claude Pro/Max subscription in all containers.
              </p>
            </div>
          )}

          {/* Setup Instructions */}
          <div className="mb-8 p-6 border border-white/10 rounded-2xl bg-black/50">
            <h2 className="text-xl font-semibold mb-4">How to Connect Claude Code</h2>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-500 font-bold shrink-0">
                  1
                </div>
                <div>
                  <h3 className="font-medium mb-1">Install Claude Code locally</h3>
                  <code className="text-sm bg-white/5 px-3 py-1.5 rounded font-mono text-orange-400 block">
                    npm install -g @anthropic-ai/claude-code
                  </code>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-500 font-bold shrink-0">
                  2
                </div>
                <div>
                  <h3 className="font-medium mb-1">Generate a long-lived token (valid 1 year)</h3>
                  <code className="text-sm bg-white/5 px-3 py-1.5 rounded font-mono text-orange-400 block">
                    claude setup-token
                  </code>
                  <p className="text-sm text-gray-500 mt-1">
                    This will open a browser to authenticate with your Anthropic account
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-500 font-bold shrink-0">
                  3
                </div>
                <div>
                  <h3 className="font-medium mb-1">Paste your token below</h3>
                  <p className="text-sm text-gray-500">
                    The token starts with <code className="font-mono bg-white/5 px-1.5 rounded">sk-ant-oat01-</code>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Token Input Form */}
          <div className="mb-8 p-6 border border-white/10 rounded-2xl bg-black/50">
            <h2 className="text-xl font-semibold mb-4">
              {status?.hasToken ? 'Update Token' : 'Add Your Claude Code Token'}
            </h2>

            <form onSubmit={handleSaveToken} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">OAuth Token</label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    placeholder="sk-ant-oat01-..."
                    className="w-full px-4 py-3 pr-12 border border-white/10 rounded-lg bg-white/5 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  >
                    {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Your token is encrypted and stored securely. Valid for 1 year.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || !token}
                className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Key className="w-5 h-5" />
                    {status?.hasToken ? 'Update Token' : 'Save Token'}
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Benefits Section */}
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="p-5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-purple-400">Use Your Subscription</h3>
              </div>
              <p className="text-sm text-gray-300">
                Claude Code in containers uses your Claude Pro/Max subscription. No extra API costs.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-blue-400">Secure & Private</h3>
              </div>
              <p className="text-sm text-gray-300">
                Token encrypted with AES-256. Only injected into your containers, never shared.
              </p>
            </div>
          </div>

          {/* Documentation Link */}
          <div className="text-center">
            <a
              href="https://code.claude.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 inline-flex items-center gap-1"
            >
              Claude Code Documentation <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
