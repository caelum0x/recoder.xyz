/**
 * Main Settings Hub
 * Central navigation for all user settings
 */

'use client';

import Link from 'next/link';
import { 
  User,
  Shield,
  Bell,
  Link2,
  Key,
  Settings as SettingsIcon,
  ChevronRight
} from 'lucide-react';

export default function SettingsPage() {
  const settingsSections = [
    {
      title: 'Account',
      description: 'Manage your account settings and preferences',
      icon: User,
      href: '/settings/account',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      title: 'Profile',
      description: 'Update your profile information and avatar',
      icon: User,
      href: '/settings/profile',
      color: 'from-purple-500 to-pink-500'
    },
    {
      title: 'Appearance',
      description: 'Customize theme, colors, and visual preferences',
      icon: SettingsIcon,
      href: '/settings/appearance',
      color: 'from-pink-500 to-purple-500'
    },
    {
      title: 'Security',
      description: 'Password, 2FA, and security settings',
      icon: Shield,
      href: '/settings/security',
      color: 'from-orange-500 to-red-500'
    },
    {
      title: 'Notifications',
      description: 'Configure your notification preferences',
      icon: Bell,
      href: '/settings/notifications',
      color: 'from-green-500 to-emerald-500'
    },
    {
      title: 'Integrations',
      description: 'Connect third-party services',
      icon: Link2,
      href: '/settings/integrations',
      color: 'from-indigo-500 to-blue-500'
    },
    {
      title: 'AI Providers',
      description: 'Manage your AI provider API keys (OpenRouter, Anthropic, OpenAI)',
      icon: Key,
      href: '/settings/ai-providers',
      color: 'from-orange-500 to-purple-600'
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-xl flex items-center justify-center">
                <SettingsIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-gray-400">Manage your account and preferences</p>
              </div>
            </div>
          </div>

          {/* Settings Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {settingsSections.map((section, index) => {
              const Icon = section.icon;
              return (
                <Link
                  key={index}
                  href={section.href}
                  className="group p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl hover:border-white/20 hover:bg-white/5 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className={`w-12 h-12 bg-gradient-to-br ${section.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold mb-1 group-hover:text-orange-500 transition-colors">
                          {section.title}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {section.description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors flex-shrink-0 ml-2" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Help Section */}
          <div className="mt-6 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <p className="text-sm text-orange-200">
              <strong>Need help?</strong> Check out our{' '}
              <Link href="/docs" className="underline hover:text-orange-300">
                documentation
              </Link>{' '}
              or{' '}
              <Link href="/support" className="underline hover:text-orange-300">
                contact support
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
