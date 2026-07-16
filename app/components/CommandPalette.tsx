/**
 * CommandPalette Component
 * Cmd+K / Ctrl+K command palette for quick navigation and actions
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RECODER_SETTINGS_URLS } from '@recoder/ecosystem-config';
import { 
  Search, 
  Terminal, 
  Settings, 
  User, 
  Home,
  BarChart,
  FileText,
  Key,
  Bell,
  Shield,
  Link2,
  ChevronRight,
  Command
} from 'lucide-react';

interface Command {
  id: string;
  title: string;
  description?: string;
  icon: any;
  action: () => void;
  category: string;
  keywords?: string[];
}

const toAppPath = (href: string) => {
  try {
    const url = new URL(href);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
};

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Define all commands
  const commands: Command[] = [
    // Navigation
    {
      id: 'nav-home',
      title: 'Home',
      description: 'Go to homepage',
      icon: Home,
      category: 'Navigation',
      action: () => router.push('/'),
    },
    {
      id: 'nav-dashboard',
      title: 'Dashboard',
      description: 'Go to dashboard',
      icon: BarChart,
      category: 'Navigation',
      action: () => router.push('/dashboard'),
    },
    {
      id: 'nav-projects',
      title: 'Projects',
      description: 'View your projects',
      icon: FileText,
      category: 'Navigation',
      action: () => router.push('/dashboard/projects'),
    },
    {
      id: 'nav-usage',
      title: 'Usage',
      description: 'View usage analytics',
      icon: BarChart,
      category: 'Navigation',
      action: () => router.push('/dashboard/usage'),
    },
    // Settings
    {
      id: 'settings-main',
      title: 'Settings',
      description: 'Open settings',
      icon: Settings,
      category: 'Settings',
      action: () => router.push(toAppPath(RECODER_SETTINGS_URLS.home.main)),
    },
    {
      id: 'settings-profile',
      title: 'Profile Settings',
      description: 'Edit your profile',
      icon: User,
      category: 'Settings',
      action: () => router.push(toAppPath(RECODER_SETTINGS_URLS.home.profile)),
    },
    {
      id: 'settings-security',
      title: 'Security Settings',
      description: 'Manage security',
      icon: Shield,
      category: 'Settings',
      action: () => router.push(toAppPath(RECODER_SETTINGS_URLS.home.security)),
    },
    {
      id: 'settings-api',
      title: 'API Keys',
      description: 'Manage API keys',
      icon: Key,
      category: 'Settings',
      action: () => router.push(toAppPath(RECODER_SETTINGS_URLS.home.apiKeys)),
    },
    {
      id: 'settings-notifications',
      title: 'Notifications',
      description: 'Configure notifications',
      icon: Bell,
      category: 'Settings',
      action: () => router.push(toAppPath(RECODER_SETTINGS_URLS.home.notifications)),
    },
    {
      id: 'settings-integrations',
      title: 'Integrations',
      description: 'Connect services',
      icon: Link2,
      category: 'Settings',
      action: () => router.push(toAppPath(RECODER_SETTINGS_URLS.home.integrations)),
    },
    // CLI
    {
      id: 'cli-setup',
      title: 'CLI Setup',
      description: 'Setup CLI',
      icon: Terminal,
      category: 'CLI',
      action: () => router.push('/cli/setup'),
    },
    {
      id: 'cli-auth',
      title: 'CLI Authentication',
      description: 'Authenticate CLI',
      icon: Terminal,
      category: 'CLI',
      action: () => router.push('/cli/auth'),
    },
  ];

  // Filter commands based on search
  const filteredCommands = commands.filter(command => {
    const searchLower = search.toLowerCase();
    return (
      command.title.toLowerCase().includes(searchLower) ||
      command.description?.toLowerCase().includes(searchLower) ||
      command.category.toLowerCase().includes(searchLower) ||
      command.keywords?.some(k => k.toLowerCase().includes(searchLower))
    );
  });

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, command) => {
    if (!acc[command.category]) {
      acc[command.category] = [];
    }
    acc[command.category].push(command);
    return acc;
  }, {} as Record<string, Command[]>);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }

      // Esc to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearch('');
        setSelectedIndex(0);
        return;
      }

      if (!isOpen) return;

      // Arrow navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const command = filteredCommands[selectedIndex];
        if (command) {
          command.action();
          setIsOpen(false);
          setSearch('');
          setSelectedIndex(0);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh] bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4">
        <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center px-4 py-4 border-b border-white/10">
            <Search className="w-5 h-5 text-gray-400 mr-3" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search commands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-lg"
            />
            <div className="flex items-center space-x-1 text-xs text-gray-500">
              <kbd className="px-2 py-1 bg-white/5 rounded border border-white/10">Esc</kbd>
              <span>to close</span>
            </div>
          </div>

          {/* Commands List */}
          <div className="max-h-[400px] overflow-y-auto">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                No commands found
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                <div key={category}>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-black/20">
                    {category}
                  </div>
                  {categoryCommands.map((command, index) => {
                    const globalIndex = filteredCommands.indexOf(command);
                    const isSelected = globalIndex === selectedIndex;
                    const Icon = command.icon;

                    return (
                      <button
                        key={command.id}
                        onClick={() => {
                          command.action();
                          setIsOpen(false);
                          setSearch('');
                          setSelectedIndex(0);
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-white/5 transition-colors ${
                          isSelected ? 'bg-orange-500/10 border-l-2 border-orange-500' : ''
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-orange-500' : 'text-gray-400'}`} />
                        <div className="flex-1 text-left">
                          <div className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                            {command.title}
                          </div>
                          {command.description && (
                            <div className="text-xs text-gray-500">
                              {command.description}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <ChevronRight className="w-4 h-4 text-orange-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-white/10 bg-black/20 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <kbd className="px-2 py-1 bg-white/5 rounded border border-white/10">↑↓</kbd>
                <span>Navigate</span>
              </div>
              <div className="flex items-center space-x-1">
                <kbd className="px-2 py-1 bg-white/5 rounded border border-white/10">Enter</kbd>
                <span>Select</span>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Command className="w-3 h-3" />
              <span>K to open</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
