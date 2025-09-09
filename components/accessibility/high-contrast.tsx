'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { Moon, Sun, Monitor, Contrast } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
//import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Switch } from '../ui/switch'

type ContrastMode = 'normal' | 'high' | 'higher' | 'highest'
type ColorBlindnessMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia'
type FontSizeMode = 'normal' | 'large' | 'larger' | 'largest'

interface AccessibilitySettings {
  contrastMode: ContrastMode
  colorBlindnessMode: ColorBlindnessMode
  fontSize: FontSizeMode
  fontSizeScale: number
  reduceMotion: boolean
  reducedTransparency: boolean
  focusIndicators: boolean
  underlineLinks: boolean
}

interface AccessibilityContextType {
  settings: AccessibilitySettings
  updateSettings: (settings: Partial<AccessibilitySettings>) => void
  toggleContrast: () => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
  resetSettings: () => void
}

const defaultSettings: AccessibilitySettings = {
  contrastMode: 'normal',
  colorBlindnessMode: 'none',
  fontSize: 'normal',
  fontSizeScale: 100,
  reduceMotion: false,
  reducedTransparency: false,
  focusIndicators: true,
  underlineLinks: false
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined)

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext)
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider')
  }
  return context
}

// High Contrast Theme Provider
export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings)

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('accessibility-settings')
    if (saved) {
      try {
        const parsedSettings = JSON.parse(saved)
        setSettings({ ...defaultSettings, ...parsedSettings })
      } catch (error) {
        console.error('Failed to load accessibility settings:', error)
      }
    }
  }, [])

  // Apply accessibility settings to document
  useEffect(() => {
    const root = document.documentElement

    // Apply contrast mode
    root.className = root.className.replace(/contrast-\w+/g, '')
    if (settings.contrastMode !== 'normal') {
      root.classList.add(`contrast-${settings.contrastMode}`)
    }

    // Apply color blindness mode
    root.className = root.className.replace(/colorblind-\w+/g, '')
    if (settings.colorBlindnessMode !== 'none') {
      root.classList.add(`colorblind-${settings.colorBlindnessMode}`)
    }

    // Apply font size
    root.className = root.className.replace(/fontsize-\w+/g, '')
    if (settings.fontSize !== 'normal') {
      root.classList.add(`fontsize-${settings.fontSize}`)
    }
    root.style.setProperty('--font-scale', `${settings.fontSizeScale}%`)

    // Apply motion preferences
    if (settings.reduceMotion) {
      root.classList.add('reduce-motion')
    } else {
      root.classList.remove('reduce-motion')
    }

    // Apply transparency preferences
    if (settings.reducedTransparency) {
      root.classList.add('reduce-transparency')
    } else {
      root.classList.remove('reduce-transparency')
    }

    // Apply focus indicators
    if (settings.focusIndicators) {
      root.classList.add('enhanced-focus')
    } else {
      root.classList.remove('enhanced-focus')
    }

    // Apply link underlines
    if (settings.underlineLinks) {
      root.classList.add('underline-links')
    } else {
      root.classList.remove('underline-links')
    }

    // Save to localStorage
    localStorage.setItem('accessibility-settings', JSON.stringify(settings))
  }, [settings])

  const updateSettings = (newSettings: Partial<AccessibilitySettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
  }

  const toggleContrast = () => {
    const modes: ContrastMode[] = ['normal', 'high', 'higher', 'highest']
    const currentIndex = modes.indexOf(settings.contrastMode)
    const nextIndex = (currentIndex + 1) % modes.length
    updateSettings({ contrastMode: modes[nextIndex] })
  }

  const increaseFontSize = () => {
    const newScale = Math.min(settings.fontSizeScale + 10, 200)
    updateSettings({ fontSizeScale: newScale })
  }

  const decreaseFontSize = () => {
    const newScale = Math.max(settings.fontSizeScale - 10, 50)
    updateSettings({ fontSizeScale: newScale })
  }

  const resetSettings = () => {
    setSettings(defaultSettings)
  }

  return (
    <AccessibilityContext.Provider
      value={{
        settings,
        updateSettings,
        toggleContrast,
        increaseFontSize,
        decreaseFontSize,
        resetSettings
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  )
}

// Quick Access Accessibility Toolbar
export const AccessibilityToolbar: React.FC = () => {
  const { settings, toggleContrast, increaseFontSize, decreaseFontSize } = useAccessibility()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex gap-2 p-2 bg-white dark:bg-gray-900 border rounded-lg shadow-lg">
      <Button
        variant="outline"
        size="sm"
        onClick={toggleContrast}
        aria-label={`Current contrast: ${settings.contrastMode}. Click to change.`}
        title="Toggle contrast mode"
      >
        <Contrast className="w-4 h-4" />
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={decreaseFontSize}
        aria-label="Decrease font size"
        title="Decrease font size"
        disabled={settings.fontSizeScale <= 50}
      >
        A-
      </Button>
      
      <Button
        variant="outline"
        size="sm"
        onClick={increaseFontSize}
        aria-label="Increase font size"
        title="Increase font size"
        disabled={settings.fontSizeScale >= 200}
      >
        A+
      </Button>
    </div>
  )
}

// Full Accessibility Settings Panel
export const AccessibilitySettings: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useAccessibility()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Contrast className="w-5 h-5" />
            Visual Accessibility
          </CardTitle>
          <CardDescription>
            Customize visual settings for better readability and accessibility
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contrast Mode */}
          <div className="space-y-3">
            <Label htmlFor="contrast-mode">Contrast Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['normal', 'high', 'higher', 'highest'] as ContrastMode[]).map((mode) => (
                <Button
                  key={mode}
                  variant={settings.contrastMode === mode ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateSettings({ contrastMode: mode })}
                  className="justify-start"
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  {settings.contrastMode === mode && (
                    <Badge variant="secondary" className="ml-auto">Active</Badge>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Color Blindness Support */}
          <div className="space-y-3">
            <Label htmlFor="colorblind-mode">Color Blindness Support</Label>
            <div className="grid grid-cols-1 gap-2">
              {([
                { value: 'none', label: 'None' },
                { value: 'protanopia', label: 'Protanopia (Red-blind)' },
                { value: 'deuteranopia', label: 'Deuteranopia (Green-blind)' },
                { value: 'tritanopia', label: 'Tritanopia (Blue-blind)' },
                { value: 'achromatopsia', label: 'Achromatopsia (Complete color blindness)' }
              ] as { value: ColorBlindnessMode; label: string }[]).map(({ value, label }) => (
                <Button
                  key={value}
                  variant={settings.colorBlindnessMode === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateSettings({ colorBlindnessMode: value })}
                  className="justify-start"
                >
                  {label}
                  {settings.colorBlindnessMode === value && (
                    <Badge variant="secondary" className="ml-auto">Active</Badge>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="space-y-3">
            <Label htmlFor="font-size">Font Size Scale: {settings.fontSizeScale}%</Label>
            <Slider
              id="font-size"
              min={50}
              max={200}
              step={10}
              value={[settings.fontSizeScale]}
              onValueChange={(values: number[]) => updateSettings({ fontSizeScale: values[0] })}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>50% (Small)</span>
              <span>100% (Normal)</span>
              <span>200% (Large)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Motion and Animation</CardTitle>
          <CardDescription>
            Reduce motion and animations for users with vestibular disorders
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reduce-motion">Reduce Motion</Label>
              <p className="text-sm text-muted-foreground">
                Minimize animations and transitions
              </p>
            </div>
            <Switch
              id="reduce-motion"
              checked={settings.reduceMotion}
              onCheckedChange={(checked: boolean) => updateSettings({ reduceMotion: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reduce-transparency">Reduce Transparency</Label>
              <p className="text-sm text-muted-foreground">
                Make transparent elements more opaque
              </p>
            </div>
            <Switch
              id="reduce-transparency"
              checked={settings.reducedTransparency}
              onCheckedChange={(checked: boolean) => updateSettings({ reducedTransparency: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Navigation and Focus</CardTitle>
          <CardDescription>
            Enhance navigation for keyboard and screen reader users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="focus-indicators">Enhanced Focus Indicators</Label>
              <p className="text-sm text-muted-foreground">
                Make keyboard focus more visible
              </p>
            </div>
            <Switch
              id="focus-indicators"
              checked={settings.focusIndicators}
              onCheckedChange={(checked: boolean) => updateSettings({ focusIndicators: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="underline-links">Underline Links</Label>
              <p className="text-sm text-muted-foreground">
                Always underline links for better identification
              </p>
            </div>
            <Switch
              id="underline-links"
              checked={settings.underlineLinks}
              onCheckedChange={(checked: boolean) => updateSettings({ underlineLinks: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={resetSettings}>
          Reset to Default Settings
        </Button>
      </div>
    </div>
  )
}

export default AccessibilityProvider
