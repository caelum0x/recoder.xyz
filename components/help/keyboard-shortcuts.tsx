'use client'

import React, { useState, useEffect } from 'react'
import { 
  Keyboard, 
  Search, 
  Command, 
  Option, 
  X,
  Settings,
  Star,
  Copy,
  Save,
  Undo,
  Redo,
  Edit,
  Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface KeyboardShortcut {
  id: string
  name: string
  description: string
  keys: string[]
  category: string
  platform: 'all' | 'mac' | 'windows' | 'linux'
  customizable: boolean
  popular: boolean
}

interface ShortcutCategory {
  id: string
  name: string
  icon: React.ReactNode
  shortcuts: KeyboardShortcut[]
}

interface KeyboardShortcutsProps {
  isOpen: boolean
  onClose: () => void
  searchQuery?: string
}

const keyboardShortcuts: KeyboardShortcut[] = [
  // General shortcuts
  {
    id: 'new-project',
    name: 'New Project',
    description: 'Create a new project',
    keys: ['⌘', 'N'],
    category: 'general',
    platform: 'all',
    customizable: true,
    popular: true
  },
  {
    id: 'open-project',
    name: 'Open Project',
    description: 'Open an existing project',
    keys: ['⌘', 'O'],
    category: 'general',
    platform: 'all',
    customizable: true,
    popular: true
  },
  {
    id: 'save-project',
    name: 'Save Project',
    description: 'Save current project',
    keys: ['⌘', 'S'],
    category: 'general',
    platform: 'all',
    customizable: false,
    popular: true
  },
  {
    id: 'command-palette',
    name: 'Command Palette',
    description: 'Open command palette',
    keys: ['⌘', 'K'],
    category: 'general',
    platform: 'all',
    customizable: true,
    popular: true
  },
  {
    id: 'quick-search',
    name: 'Quick Search',
    description: 'Search across projects and files',
    keys: ['⌘', 'P'],
    category: 'general',
    platform: 'all',
    customizable: true,
    popular: true
  },

  // Editor shortcuts
  {
    id: 'duplicate-line',
    name: 'Duplicate Line',
    description: 'Duplicate current line or selection',
    keys: ['⌘', 'D'],
    category: 'editor',
    platform: 'all',
    customizable: true,
    popular: true
  },
  {
    id: 'delete-line',
    name: 'Delete Line',
    description: 'Delete current line',
    keys: ['⌘', '⇧', 'K'],
    category: 'editor',
    platform: 'all',
    customizable: true,
    popular: false
  },
  {
    id: 'move-line-up',
    name: 'Move Line Up',
    description: 'Move current line up',
    keys: ['⌥', '↑'],
    category: 'editor',
    platform: 'all',
    customizable: true,
    popular: false
  },
  {
    id: 'move-line-down',
    name: 'Move Line Down',
    description: 'Move current line down',
    keys: ['⌥', '↓'],
    category: 'editor',
    platform: 'all',
    customizable: true,
    popular: false
  },
  {
    id: 'toggle-comment',
    name: 'Toggle Comment',
    description: 'Comment/uncomment current line',
    keys: ['⌘', '/'],
    category: 'editor',
    platform: 'all',
    customizable: true,
    popular: true
  },
  {
    id: 'format-code',
    name: 'Format Code',
    description: 'Auto-format current file',
    keys: ['⌘', '⇧', 'F'],
    category: 'editor',
    platform: 'all',
    customizable: true,
    popular: true
  },

  // AI shortcuts
  {
    id: 'ai-suggest',
    name: 'AI Suggestions',
    description: 'Get AI code suggestions',
    keys: ['⌘', 'I'],
    category: 'ai',
    platform: 'all',
    customizable: true,
    popular: true
  },
  {
    id: 'ai-complete',
    name: 'AI Complete',
    description: 'Complete code with AI',
    keys: ['Tab'],
    category: 'ai',
    platform: 'all',
    customizable: false,
    popular: true
  },
  {
    id: 'ai-explain',
    name: 'AI Explain',
    description: 'Explain selected code with AI',
    keys: ['⌘', 'E'],
    category: 'ai',
    platform: 'all',
    customizable: true,
    popular: false
  },
  {
    id: 'ai-refactor',
    name: 'AI Refactor',
    description: 'Refactor code with AI',
    keys: ['⌘', 'R'],
    category: 'ai',
    platform: 'all',
    customizable: true,
    popular: true
  },

  // Navigation shortcuts
  {
    id: 'go-to-file',
    name: 'Go to File',
    description: 'Quick file navigation',
    keys: ['⌘', 'P'],
    category: 'navigation',
    platform: 'all',
    customizable: true,
    popular: true
  },
  {
    id: 'go-to-line',
    name: 'Go to Line',
    description: 'Jump to specific line number',
    keys: ['⌘', 'G'],
    category: 'navigation',
    platform: 'all',
    customizable: true,
    popular: false
  },
  {
    id: 'next-tab',
    name: 'Next Tab',
    description: 'Switch to next tab',
    keys: ['⌘', '⇧', ']'],
    category: 'navigation',
    platform: 'all',
    customizable: true,
    popular: false
  },
  {
    id: 'prev-tab',
    name: 'Previous Tab',
    description: 'Switch to previous tab',
    keys: ['⌘', '⇧', '['],
    category: 'navigation',
    platform: 'all',
    customizable: true,
    popular: false
  },

  // View shortcuts
  {
    id: 'toggle-sidebar',
    name: 'Toggle Sidebar',
    description: 'Show/hide sidebar',
    keys: ['⌘', 'B'],
    category: 'view',
    platform: 'all',
    customizable: true,
    popular: true
  },
  {
    id: 'toggle-terminal',
    name: 'Toggle Terminal',
    description: 'Show/hide terminal',
    keys: ['⌘', '`'],
    category: 'view',
    platform: 'all',
    customizable: true,
    popular: true
  },
  {
    id: 'zen-mode',
    name: 'Zen Mode',
    description: 'Enter distraction-free mode',
    keys: ['⌘', 'K', 'Z'],
    category: 'view',
    platform: 'all',
    customizable: true,
    popular: false
  },
  {
    id: 'fullscreen',
    name: 'Fullscreen',
    description: 'Toggle fullscreen mode',
    keys: ['⌘', '⌃', 'F'],
    category: 'view',
    platform: 'all',
    customizable: false,
    popular: false
  }
]

const shortcutCategories: ShortcutCategory[] = [
  {
    id: 'general',
    name: 'General',
    icon: <Command className="w-4 h-4" />,
    shortcuts: keyboardShortcuts.filter(s => s.category === 'general')
  },
  {
    id: 'editor',
    name: 'Editor',
    icon: <Edit className="w-4 h-4" />,
    shortcuts: keyboardShortcuts.filter(s => s.category === 'editor')
  },
  {
    id: 'ai',
    name: 'AI Features',
    icon: <Zap className="w-4 h-4" />,
    shortcuts: keyboardShortcuts.filter(s => s.category === 'ai')
  },
  {
    id: 'navigation',
    name: 'Navigation',
    icon: <Search className="w-4 h-4" />,
    shortcuts: keyboardShortcuts.filter(s => s.category === 'navigation')
  },
  {
    id: 'view',
    name: 'View',
    icon: <Settings className="w-4 h-4" />,
    shortcuts: keyboardShortcuts.filter(s => s.category === 'view')
  }
]

export function KeyboardShortcuts({ isOpen, onClose, searchQuery: initialSearchQuery }: KeyboardShortcutsProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [filteredShortcuts, setFilteredShortcuts] = useState(keyboardShortcuts)
  const [showPopularOnly, setShowPopularOnly] = useState(false)

  useEffect(() => {
    let filtered = keyboardShortcuts

    if (searchQuery) {
      filtered = filtered.filter(shortcut =>
        shortcut.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shortcut.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shortcut.keys.some(key => key.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    }

    if (selectedCategory) {
      filtered = filtered.filter(shortcut => shortcut.category === selectedCategory)
    }

    if (showPopularOnly) {
      filtered = filtered.filter(shortcut => shortcut.popular)
    }

    setFilteredShortcuts(filtered)
  }, [searchQuery, selectedCategory, showPopularOnly])

  const renderKeyboardKey = (key: string) => {
    const keyMap: { [key: string]: React.ReactNode } = {
      '⌘': <Command className="w-3 h-3" />,
      '⌥': <Option className="w-3 h-3" />,
      '⇧': '⇧',
      '⌃': 'Ctrl',
      '↑': '↑',
      '↓': '↓',
      '←': '←',
      '→': '→',
      'Tab': 'Tab',
      'Space': 'Space',
      'Enter': '↵',
      'Esc': 'Esc'
    }

    return keyMap[key] || key
  }

  const copyShortcut = (shortcut: KeyboardShortcut) => {
    const shortcutText = `${shortcut.name}: ${shortcut.keys.join(' + ')}`
    navigator.clipboard.writeText(shortcutText)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Keyboard className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Keyboard Shortcuts
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowPopularOnly(!showPopularOnly)}
              className={showPopularOnly ? 'bg-blue-100 dark:bg-blue-900' : ''}
            >
              <Star className="w-4 h-4 mr-2" />
              Popular
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex h-[calc(90vh-120px)]">
          {/* Sidebar */}
          <div className="w-80 border-r border-gray-200 dark:border-gray-700 p-6 overflow-y-auto">
            {/* Search */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search shortcuts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Categories */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Categories
              </h3>
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedCategory === null
                      ? 'bg-gray-100 dark:bg-gray-800'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Keyboard className="w-4 h-4" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        All Shortcuts
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {keyboardShortcuts.length}
                    </span>
                  </div>
                </button>

                {shortcutCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedCategory === category.id
                        ? 'bg-gray-100 dark:bg-gray-800'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {category.icon}
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {category.name}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {category.shortcuts.length}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Platform Info */}
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Platform Keys
              </h4>
              <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <Command className="w-3 h-3" />
                  <span>Cmd (Mac) / Ctrl (Windows/Linux)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Option className="w-3 h-3" />
                  <span>Option (Mac) / Alt (Windows/Linux)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 text-center">⇧</span>
                  <span>Shift</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedCategory 
                  ? shortcutCategories.find(c => c.id === selectedCategory)?.name 
                  : searchQuery 
                    ? `Search results for "${searchQuery}"` 
                    : showPopularOnly
                      ? 'Popular Shortcuts'
                      : 'All Shortcuts'
                }
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {filteredShortcuts.length} shortcuts found
              </p>
            </div>

            {/* Shortcuts Grid */}
            <div className="grid gap-3">
              {filteredShortcuts.map((shortcut) => (
                <Card 
                  key={shortcut.id} 
                  className="hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {shortcut.name}
                          </h4>
                          {shortcut.popular && (
                            <Badge variant="default" className="text-xs">
                              <Star className="w-2 h-2 mr-1" />
                              Popular
                            </Badge>
                          )}
                          {shortcut.customizable && (
                            <Badge variant="outline" className="text-xs">
                              Customizable
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {shortcut.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Keyboard Keys */}
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, index) => (
                            <React.Fragment key={index}>
                              <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded-lg dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 min-w-[24px] h-6 flex items-center justify-center">
                                {renderKeyboardKey(key)}
                              </kbd>
                              {index < shortcut.keys.length - 1 && (
                                <span className="text-gray-400 text-xs">+</span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>

                        {/* Copy Button */}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyShortcut(shortcut)}
                          className="h-8 w-8 p-0"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredShortcuts.length === 0 && (
              <div className="text-center py-12">
                <Keyboard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No shortcuts found
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Try adjusting your search terms or filters.
                </p>
              </div>
            )}

            {/* Customization Info */}
            <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <Settings className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  Customize Your Shortcuts
                </h4>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Many shortcuts can be customized to fit your workflow. Visit settings to configure your preferred key bindings.
              </p>
              <Button size="sm" variant="outline">
                Open Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KeyboardShortcuts
