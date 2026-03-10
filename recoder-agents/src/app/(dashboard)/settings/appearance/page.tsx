'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, Sun, Moon, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'recoder-appearance-settings';

type ThemeOption = 'system' | 'light' | 'dark';
type FontSize = 'small' | 'medium' | 'large';

interface AppearanceSettings {
  theme: ThemeOption;
  fontSize: FontSize;
  compactMode: boolean;
  reducedAnimations: boolean;
}

const defaultSettings: AppearanceSettings = {
  theme: 'system',
  fontSize: 'medium',
  compactMode: false,
  reducedAnimations: false,
};

const themeOptions: { value: ThemeOption; label: string; icon: React.ElementType; description: string }[] = [
  { value: 'system', label: 'System', icon: Monitor, description: 'Follow your OS preference' },
  { value: 'light', label: 'Light', icon: Sun, description: 'Light background' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Dark background' },
];

const fontSizeOptions: { value: FontSize; label: string; preview: string }[] = [
  { value: 'small', label: 'Small', preview: 'text-sm' },
  { value: 'medium', label: 'Medium', preview: 'text-base' },
  { value: 'large', label: 'Large', preview: 'text-lg' },
];

function loadSettings(): AppearanceSettings {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    // Ignore parse errors
  }
  return defaultSettings;
}

function applyTheme(theme: ThemeOption) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(prefersDark ? 'dark' : 'light');
  } else {
    root.classList.add(theme);
  }
}

function applyFontSize(fontSize: FontSize) {
  const root = document.documentElement;
  root.classList.remove('text-sm', 'text-base', 'text-lg');
  const sizeMap: Record<FontSize, string> = { small: 'text-sm', medium: 'text-base', large: 'text-lg' };
  root.style.fontSize = fontSize === 'small' ? '14px' : fontSize === 'large' ? '18px' : '16px';
}

function applyReducedAnimations(reduced: boolean) {
  if (reduced) {
    document.documentElement.style.setProperty('--transition-speed', '0s');
    document.documentElement.classList.add('reduce-motion');
  } else {
    document.documentElement.style.removeProperty('--transition-speed');
    document.documentElement.classList.remove('reduce-motion');
  }
}

export default function AppearanceSettingsPage() {
  const [settings, setSettings] = useState<AppearanceSettings>(defaultSettings);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    applyTheme(loaded.theme);
    applyFontSize(loaded.fontSize);
    applyReducedAnimations(loaded.reducedAnimations);
  }, []);

  const persist = useCallback((next: AppearanceSettings) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleThemeChange = (theme: ThemeOption) => {
    const next = { ...settings, theme };
    setSettings(next);
    applyTheme(theme);
    persist(next);
  };

  const handleFontSizeChange = (fontSize: FontSize) => {
    const next = { ...settings, fontSize };
    setSettings(next);
    applyFontSize(fontSize);
    persist(next);
  };

  const handleCompactModeChange = (compactMode: boolean) => {
    const next = { ...settings, compactMode };
    setSettings(next);
    persist(next);
    toast.info(compactMode ? 'Compact mode enabled' : 'Compact mode disabled');
  };

  const handleReducedAnimationsChange = (reducedAnimations: boolean) => {
    const next = { ...settings, reducedAnimations };
    setSettings(next);
    applyReducedAnimations(reducedAnimations);
    persist(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customize how Recoder looks and feels.
        </p>
      </div>

      {/* Theme Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Select your preferred color scheme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isActive = settings.theme === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleThemeChange(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:bg-muted/50',
                    isActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  )}
                >
                  <Icon className={cn('h-6 w-6', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  <span className={cn('text-sm font-medium', isActive ? 'text-primary' : 'text-foreground')}>
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Display Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Display
          </CardTitle>
          <CardDescription>
            Adjust font size and display density.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Font Size */}
          <div className="space-y-3">
            <Label>Font Size</Label>
            <RadioGroup
              value={settings.fontSize}
              onValueChange={(v) => handleFontSizeChange(v as FontSize)}
              className="flex gap-3"
            >
              {fontSizeOptions.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <RadioGroupItem value={option.value} id={`font-${option.value}`} />
                  <Label htmlFor={`font-${option.value}`} className={option.preview}>
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <Separator />

          {/* Compact Mode */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="compact-mode" className="text-sm font-medium">
                Compact mode
              </Label>
              <p className="text-xs text-muted-foreground">
                Reduce spacing and padding throughout the interface
              </p>
            </div>
            <Switch
              id="compact-mode"
              checked={settings.compactMode}
              onCheckedChange={handleCompactModeChange}
            />
          </div>

          <Separator />

          {/* Reduced Animations */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="reduced-animations" className="text-sm font-medium">
                Reduced animations
              </Label>
              <p className="text-xs text-muted-foreground">
                Minimize motion effects for accessibility or performance
              </p>
            </div>
            <Switch
              id="reduced-animations"
              checked={settings.reducedAnimations}
              onCheckedChange={handleReducedAnimationsChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
