/**
 * Settings Layout Page for Recoder Web
 * Main settings navigation and layout
 */

import { Outlet, Link, useLocation } from '@remix-run/react';
import { useState } from 'react';

export default function SettingsLayout() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const settingsSections = [
    {
      title: 'Project',
      items: [
        { name: 'Project Context', path: '/settings/context', icon: '📝' },
      ],
    },
    {
      title: 'Integrations',
      items: [
        { name: 'MCP Servers', path: '/settings/mcp', icon: '🔌' },
        { name: 'GitHub', path: '/settings/github', icon: '🐙' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { name: 'Editor', path: '/settings/editor', icon: '⚙️' },
        { name: 'AI Settings', path: '/settings/ai', icon: '🤖' },
        { name: 'Terminal', path: '/settings/terminal', icon: '💻' },
      ],
    },
    {
      title: 'Interface',
      items: [
        { name: 'Keyboard Shortcuts', path: '/settings/shortcuts', icon: '⌨️' },
        { name: 'Appearance', path: '/settings/appearance', icon: '🎨' },
      ],
    },
    {
      title: 'Account',
      items: [
        { name: 'Profile', path: '/settings/profile', icon: '👤' },
        { name: 'Security', path: '/settings/security', icon: '🔒' },
      ],
    },
  ];

  return (
    <div className="h-screen flex bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      {/* Settings Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-200 border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 overflow-hidden`}
      >
        <div className="p-4 border-b border-bolt-elements-borderColor">
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-sm text-bolt-elements-textSecondary mt-1">
            Configure your IDE preferences
          </p>
        </div>

        <nav className="p-4 space-y-6">
          {settingsSections.map((section) => (
            <div key={section.title}>
              <h2 className="text-xs font-semibold text-bolt-elements-textSecondary uppercase tracking-wider mb-2">
                {section.title}
              </h2>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-item-contentActive'
                          : 'hover:bg-bolt-elements-item-backgroundHover text-bolt-elements-textPrimary'
                      }`}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span className="text-sm font-medium">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="absolute bottom-4 left-4">
          <Link
            to="/"
            className="flex items-center space-x-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
          >
            <span>←</span>
            <span>Back to IDE</span>
          </Link>
        </div>
      </aside>

      {/* Settings Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          <Outlet />
        </div>
      </main>

      {/* Toggle Sidebar Button */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed bottom-4 left-4 p-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-item-backgroundHover transition-colors z-10"
        title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        {isSidebarOpen ? '◀' : '▶'}
      </button>
    </div>
  );
}
