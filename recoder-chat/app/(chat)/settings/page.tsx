'use client';

import { useState } from 'react';
import { 
  User, Bell, Shield, Palette, Globe, 
  Smartphone, Monitor, Moon, Sun, Volume2,
  Lock, Key, Eye, EyeOff, Save, RefreshCw
} from 'lucide-react';

// Simple button component
const Button = ({ children, className = '', size = 'md', ...props }: {
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  [key: string]: any;
}) => {
  const sizeClasses: Record<string, string> = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };
  
  return (
    <button 
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState({
    messages: true,
    mentions: true,
    channels: false,
    email: true,
    push: true,
    sounds: true
  });

  const settingsTabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield },
    { id: 'language', label: 'Language & Region', icon: Globe },
    { id: 'devices', label: 'Devices', icon: Smartphone }
  ];

  const connectedDevices = [
    {
      id: 1,
      name: 'MacBook Pro',
      type: 'Desktop',
      browser: 'Chrome',
      location: 'San Francisco, CA',
      lastActive: 'Active now',
      current: true
    },
    {
      id: 2,
      name: 'iPhone 14 Pro',
      type: 'Mobile',
      browser: 'Safari',
      location: 'San Francisco, CA',
      lastActive: '2 hours ago',
      current: false
    },
    {
      id: 3,
      name: 'iPad Air',
      type: 'Tablet',
      browser: 'Safari',
      location: 'San Francisco, CA',
      lastActive: '1 day ago',
      current: false
    }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Profile Information</h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                    SK
                  </div>
                  <div>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white mr-2">
                      Change Photo
                    </Button>
                    <Button className="bg-gray-200 hover:bg-gray-300 text-gray-700">
                      Remove
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      defaultValue="Sarah Kim"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      defaultValue="sarah.kim@recoder.xyz"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Job Title
                    </label>
                    <input
                      type="text"
                      defaultValue="Engineering Manager"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Department
                    </label>
                    <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option>Engineering</option>
                      <option>Design</option>
                      <option>Product</option>
                      <option>Marketing</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Bio
                  </label>
                  <textarea
                    rows={4}
                    defaultValue="Passionate about building great software and leading high-performing teams. Love mentoring developers and solving complex technical challenges."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Notification Preferences</h3>
              <div className="space-y-4">
                {Object.entries(notifications).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white capitalize">
                        {key === 'push' ? 'Push Notifications' : key}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {key === 'messages' && 'Get notified when you receive new direct messages'}
                        {key === 'mentions' && 'Get notified when someone mentions you'}
                        {key === 'channels' && 'Get notified for all channel messages'}
                        {key === 'email' && 'Receive email notifications for important updates'}
                        {key === 'push' && 'Receive push notifications on your devices'}
                        {key === 'sounds' && 'Play notification sounds'}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => setNotifications(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Appearance Settings</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Theme</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { id: 'light', label: 'Light', icon: Sun },
                      { id: 'dark', label: 'Dark', icon: Moon },
                      { id: 'system', label: 'System', icon: Monitor }
                    ].map((theme) => (
                      <div
                        key={theme.id}
                        className="border-2 border-gray-200 dark:border-gray-600 rounded-lg p-4 cursor-pointer hover:border-blue-500 transition-colors"
                      >
                        <div className="flex flex-col items-center space-y-2">
                          <theme.icon className="h-8 w-8 text-gray-600 dark:text-gray-300" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{theme.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Message Display</h4>
                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" defaultChecked />
                      <span className="ml-2 text-gray-700 dark:text-gray-300">Show message timestamps</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" defaultChecked />
                      <span className="ml-2 text-gray-700 dark:text-gray-300">Show user avatars</span>
                    </label>
                    <label className="flex items-center">
                      <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" />
                      <span className="ml-2 text-gray-700 dark:text-gray-300">Compact message layout</span>
                    </label>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Font Size</h4>
                  <select className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option>Small</option>
                    <option selected>Medium</option>
                    <option>Large</option>
                    <option>Extra Large</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 'privacy':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Privacy & Security</h3>
              <div className="space-y-6">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-center">
                    <Shield className="h-5 w-5 text-yellow-600 mr-2" />
                    <span className="font-medium text-yellow-800 dark:text-yellow-200">
                      Two-Factor Authentication Enabled
                    </span>
                  </div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    Your account is secured with 2FA
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Change Password</h4>
                  <div className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Current Password
                      </label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      Update Password
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Privacy Controls</h4>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between">
                      <span className="text-gray-700 dark:text-gray-300">Show online status</span>
                      <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" defaultChecked />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-gray-700 dark:text-gray-300">Allow direct messages from anyone</span>
                      <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" defaultChecked />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-gray-700 dark:text-gray-300">Show typing indicators</span>
                      <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600" defaultChecked />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'language':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Language & Region</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Language</h4>
                  <select className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option selected>English (US)</option>
                    <option>English (UK)</option>
                    <option>Español</option>
                    <option>Français</option>
                    <option>Deutsch</option>
                    <option>日本語</option>
                    <option>한국어</option>
                  </select>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Timezone</h4>
                  <select className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option selected>(UTC-08:00) Pacific Time</option>
                    <option>(UTC-05:00) Eastern Time</option>
                    <option>(UTC+00:00) GMT</option>
                    <option>(UTC+01:00) Central European Time</option>
                    <option>(UTC+09:00) Japan Standard Time</option>
                  </select>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Date Format</h4>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input type="radio" name="dateFormat" className="border-gray-300 dark:border-gray-600" defaultChecked />
                      <span className="ml-2 text-gray-700 dark:text-gray-300">MM/DD/YYYY (12/31/2024)</span>
                    </label>
                    <label className="flex items-center">
                      <input type="radio" name="dateFormat" className="border-gray-300 dark:border-gray-600" />
                      <span className="ml-2 text-gray-700 dark:text-gray-300">DD/MM/YYYY (31/12/2024)</span>
                    </label>
                    <label className="flex items-center">
                      <input type="radio" name="dateFormat" className="border-gray-300 dark:border-gray-600" />
                      <span className="ml-2 text-gray-700 dark:text-gray-300">YYYY-MM-DD (2024-12-31)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'devices':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Connected Devices</h3>
              <div className="space-y-4">
                {connectedDevices.map((device) => (
                  <div key={device.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                          {device.type === 'Desktop' && <Monitor className="h-6 w-6 text-gray-600 dark:text-gray-300" />}
                          {device.type === 'Mobile' && <Smartphone className="h-6 w-6 text-gray-600 dark:text-gray-300" />}
                          {device.type === 'Tablet' && <Smartphone className="h-6 w-6 text-gray-600 dark:text-gray-300" />}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium text-gray-900 dark:text-white">{device.name}</h4>
                            {device.current && (
                              <span className="px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-xs rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {device.browser} • {device.location}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-500">
                            {device.lastActive}
                          </p>
                        </div>
                      </div>
                      {!device.current && (
                        <Button size="sm" className="bg-red-100 hover:bg-red-200 text-red-700">
                          Sign Out
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                <Button className="bg-red-600 hover:bg-red-700 text-white">
                  Sign Out All Other Devices
                </Button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
          </div>
          <nav className="p-4">
            <div className="space-y-2">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center px-3 py-2 rounded-lg text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <tab.icon className="h-5 w-5 mr-3" />
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8">
            {renderTabContent()}
            
            {/* Save Button */}
            <div className="flex justify-end mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
              <div className="flex space-x-3">
                <Button className="bg-gray-300 hover:bg-gray-400 text-gray-700">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
