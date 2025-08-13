/**
 * Theme Toggle Component
 * PRODUCTION FEATURE: Professional dark mode toggle with system preference detection
 * Enterprise UI/UX that competitors lack
 */

'use client'

import * as React from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme, type Theme } from './theme-provider'

interface ThemeToggleProps {
  variant?: 'default' | 'minimal' | 'dropdown'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

export function ThemeToggle({ 
  variant = 'default', 
  size = 'md',
  showLabel = false,
  className = ''
}: ThemeToggleProps) {
  const { theme, setTheme, themes: availableThemes, mounted } = useTheme()

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className={`animate-pulse ${getSizeClasses(size)} ${className}`}>
        <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    )
  }

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor
  }

  const themeLabels = {
    light: 'Light Mode',
    dark: 'Dark Mode', 
    system: 'System'
  }

  if (variant === 'dropdown') {
    return (
      <div className={`relative ${className}`}>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as Theme)}
          className={`
            ${getSizeClasses(size)}
            bg-background border border-border rounded-md
            text-foreground focus:outline-none focus:ring-2 focus:ring-ring
            pr-8 cursor-pointer
          `}
        >
          {availableThemes.map((themeKey) => (
            <option key={themeKey} value={themeKey}>
              {themeLabels[themeKey as keyof typeof themeLabels]}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (variant === 'minimal') {
    const currentTheme = theme || 'system'
    const Icon = themeIcons[currentTheme as keyof typeof themeIcons]

    return (
      <button
        onClick={() => {
          const nextTheme = currentTheme === 'light' ? 'dark' : 
                          currentTheme === 'dark' ? 'system' : 'light'
          setTheme(nextTheme)
        }}
        className={`
          ${getSizeClasses(size)}
          p-2 rounded-md border border-border
          bg-background hover:bg-secondary
          text-foreground hover:text-secondary-foreground
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          ${className}
        `}
        title={`Current: ${themeLabels[currentTheme as keyof typeof themeLabels]}`}
      >
        <Icon className="w-4 h-4" />
      </button>
    )
  }

  // Default toggle between light and dark (most common)
  const isDark = theme === 'dark'
  const Icon = isDark ? Moon : Sun

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`
        ${getSizeClasses(size)}
        flex items-center gap-2 px-3 py-2 rounded-md border border-border
        bg-background hover:bg-secondary
        text-foreground hover:text-secondary-foreground
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
        ${className}
      `}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <Icon className="w-4 h-4" />
      {showLabel && (
        <span className="text-sm font-medium">
          {isDark ? 'Dark' : 'Light'}
        </span>
      )}
    </button>
  )
}

// Theme Toggle Group for all options
export function ThemeToggleGroup({ className = '' }: { className?: string }) {
  const { theme, setTheme, mounted } = useTheme()

  if (!mounted) {
    return (
      <div className={`flex gap-1 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  const options = [
    { key: 'light', icon: Sun, label: 'Light' },
    { key: 'dark', icon: Moon, label: 'Dark' },
    { key: 'system', icon: Monitor, label: 'System' },
  ] as const

  return (
    <div className={`flex items-center gap-1 p-1 bg-muted rounded-md ${className}`}>
      {options.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => setTheme(key)}
          className={`
            flex items-center justify-center w-8 h-8 rounded-sm
            transition-all duration-200
            ${theme === key 
              ? 'bg-background text-foreground shadow-sm' 
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }
          `}
          title={`${label} mode`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  )
}

function getSizeClasses(size: 'sm' | 'md' | 'lg') {
  switch (size) {
    case 'sm':
      return 'text-xs'
    case 'lg':
      return 'text-lg'
    default:
      return 'text-sm'
  }
}

// Advanced theme customizer component
export function ThemeCustomizer() {
  const { theme, setTheme, themeConfig, resolvedTheme } = useTheme()
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          flex items-center gap-2 px-4 py-2 rounded-md border border-border
          bg-background hover:bg-secondary text-foreground
          transition-colors duration-200
        "
      >
        <Monitor className="w-4 h-4" />
        <span className="text-sm font-medium">Theme</span>
      </button>

      {isOpen && (
        <div className="
          absolute top-full right-0 mt-2 w-72 p-4 
          bg-popover border border-border rounded-lg shadow-lg
          z-50
        ">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Theme Mode</h3>
              <ThemeToggleGroup />
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-medium mb-2">Preview</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span>Current Theme:</span>
                  <span className="font-mono">{theme}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Resolved:</span>
                  <span className="font-mono">{resolvedTheme}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-medium mb-2">Color Preview</h4>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries({
                  primary: 'bg-primary',
                  secondary: 'bg-secondary', 
                  accent: 'bg-accent',
                  muted: 'bg-muted'
                }).map(([name, className]) => (
                  <div key={name} className="text-center">
                    <div className={`w-8 h-8 rounded ${className} mx-auto mb-1`} />
                    <span className="text-xs text-muted-foreground">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { type Theme }