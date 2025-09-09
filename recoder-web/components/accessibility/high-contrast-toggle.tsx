'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Palette, Eye, Sun, Moon, Monitor, Contrast,
  Check, Settings, Accessibility, ZapIcon
} from 'lucide-react';
import { toast } from 'sonner';

interface ContrastSettings {
  highContrast: boolean;
  reduceMotion: boolean;
  largeFocus: boolean;
  colorBlindFriendly: boolean;
  theme: 'system' | 'light' | 'dark' | 'high-contrast';
}

interface AccessibilitySettings {
  contrast: ContrastSettings;
  fontSize: 'normal' | 'large' | 'extra-large';
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
}

export default function HighContrastToggle() {
  const [settings, setSettings] = useState<AccessibilitySettings>({
    contrast: {
      highContrast: false,
      reduceMotion: false,
      largeFocus: false,
      colorBlindFriendly: false,
      theme: 'system',
    },
    fontSize: 'normal',
    screenReaderOptimized: false,
    keyboardNavigation: true,
  });

  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Load saved settings from localStorage
    const savedSettings = localStorage.getItem('accessibility-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(parsed);
        applyAccessibilitySettings(parsed);
      } catch (error) {
        console.error('Failed to parse accessibility settings:', error);
      }
    }

    // Detect system preferences
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)');
    const prefersColorScheme = window.matchMedia('(prefers-color-scheme: dark)');

    // Update settings based on system preferences if not already set
    if (prefersReducedMotion.matches && !savedSettings) {
      updateSetting('contrast', 'reduceMotion', true);
    }

    if (prefersHighContrast.matches && !savedSettings) {
      updateSetting('contrast', 'highContrast', true);
    }

    // Listen for system preference changes
    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      updateSetting('contrast', 'reduceMotion', e.matches);
    };

    const handleHighContrastChange = (e: MediaQueryListEvent) => {
      updateSetting('contrast', 'highContrast', e.matches);
    };

    prefersReducedMotion.addEventListener('change', handleReducedMotionChange);
    prefersHighContrast.addEventListener('change', handleHighContrastChange);

    return () => {
      prefersReducedMotion.removeEventListener('change', handleReducedMotionChange);
      prefersHighContrast.removeEventListener('change', handleHighContrastChange);
    };
  }, []);

  const updateSetting = <K extends keyof AccessibilitySettings>(
    category: K,
    key: keyof AccessibilitySettings[K],
    value: any
  ) => {
    const newSettings = {
      ...settings,
      [category]: {
        ...settings[category],
        [key]: value,
      },
    };

    setSettings(newSettings);
    applyAccessibilitySettings(newSettings);
    localStorage.setItem('accessibility-settings', JSON.stringify(newSettings));
  };

  const applyAccessibilitySettings = (settings: AccessibilitySettings) => {
    const root = document.documentElement;

    // High contrast mode
    if (settings.contrast.highContrast) {
      root.classList.add('high-contrast');
      root.style.setProperty('--background', '#000000');
      root.style.setProperty('--foreground', '#ffffff');
      root.style.setProperty('--muted', '#1a1a1a');
      root.style.setProperty('--muted-foreground', '#e5e5e5');
      root.style.setProperty('--border', '#ffffff');
      root.style.setProperty('--primary', '#ffffff');
      root.style.setProperty('--primary-foreground', '#000000');
      root.style.setProperty('--secondary', '#333333');
      root.style.setProperty('--secondary-foreground', '#ffffff');
    } else {
      root.classList.remove('high-contrast');
      root.style.removeProperty('--background');
      root.style.removeProperty('--foreground');
      root.style.removeProperty('--muted');
      root.style.removeProperty('--muted-foreground');
      root.style.removeProperty('--border');
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--secondary');
      root.style.removeProperty('--secondary-foreground');
    }

    // Reduced motion
    if (settings.contrast.reduceMotion) {
      root.style.setProperty('--transition-duration', '0ms');
      root.style.setProperty('--animation-duration', '0ms');
      root.classList.add('reduce-motion');
    } else {
      root.style.removeProperty('--transition-duration');
      root.style.removeProperty('--animation-duration');
      root.classList.remove('reduce-motion');
    }

    // Large focus indicators
    if (settings.contrast.largeFocus) {
      root.classList.add('large-focus');
    } else {
      root.classList.remove('large-focus');
    }

    // Color blind friendly mode
    if (settings.contrast.colorBlindFriendly) {
      root.classList.add('color-blind-friendly');
      // Use patterns and shapes instead of just colors for status indicators
      root.style.setProperty('--success-color', '#0066cc');
      root.style.setProperty('--error-color', '#cc0000');
      root.style.setProperty('--warning-color', '#ff6600');
    } else {
      root.classList.remove('color-blind-friendly');
      root.style.removeProperty('--success-color');
      root.style.removeProperty('--error-color');
      root.style.removeProperty('--warning-color');
    }

    // Font size
    switch (settings.fontSize) {
      case 'large':
        root.style.setProperty('--base-font-size', '18px');
        break;
      case 'extra-large':
        root.style.setProperty('--base-font-size', '22px');
        break;
      default:
        root.style.removeProperty('--base-font-size');
    }

    // Screen reader optimization
    if (settings.screenReaderOptimized) {
      root.classList.add('screen-reader-optimized');
    } else {
      root.classList.remove('screen-reader-optimized');
    }

    // Keyboard navigation enhancements
    if (settings.keyboardNavigation) {
      root.classList.add('enhanced-keyboard-nav');
    } else {
      root.classList.remove('enhanced-keyboard-nav');
    }
  };

  const resetToDefaults = () => {
    const defaultSettings: AccessibilitySettings = {
      contrast: {
        highContrast: false,
        reduceMotion: false,
        largeFocus: false,
        colorBlindFriendly: false,
        theme: 'system',
      },
      fontSize: 'normal',
      screenReaderOptimized: false,
      keyboardNavigation: true,
    };

    setSettings(defaultSettings);
    applyAccessibilitySettings(defaultSettings);
    localStorage.setItem('accessibility-settings', JSON.stringify(defaultSettings));
    toast.success('Accessibility settings reset to defaults');
  };

  if (!isExpanded) {
    return (
      <Button
        onClick={() => setIsExpanded(true)}
        variant="outline"
        size="sm"
        className="fixed bottom-4 left-4 z-50 shadow-lg"
        aria-label="Open accessibility settings"
      >
        <Accessibility className="w-4 h-4 mr-2" />
        Accessibility
        {(settings.contrast.highContrast || settings.contrast.reduceMotion) && (
          <Badge variant="secondary" className="ml-2 px-1 py-0 text-xs">
            Active
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 left-4 w-80 shadow-lg border-2 z-50 max-h-[80vh] overflow-y-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Accessibility className="w-5 h-5" />
            Accessibility Settings
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(false)}
            className="h-8 w-8 p-0"
            aria-label="Close accessibility settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Customize the interface for your needs
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Visual Accessibility */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Visual
          </h4>
          
          <div className="space-y-2">
            <label className="flex items-center justify-between">
              <span className="text-sm">High contrast mode</span>
              <Button
                variant={settings.contrast.highContrast ? "default" : "outline"}
                size="sm"
                onClick={() => updateSetting('contrast', 'highContrast', !settings.contrast.highContrast)}
                className="h-6 px-2"
              >
                {settings.contrast.highContrast ? <Check className="w-3 h-3" /> : <Contrast className="w-3 h-3" />}
              </Button>
            </label>

            <label className="flex items-center justify-between">
              <span className="text-sm">Large focus indicators</span>
              <Button
                variant={settings.contrast.largeFocus ? "default" : "outline"}
                size="sm"
                onClick={() => updateSetting('contrast', 'largeFocus', !settings.contrast.largeFocus)}
                className="h-6 px-2"
              >
                {settings.contrast.largeFocus ? <Check className="w-3 h-3" /> : <ZapIcon className="w-3 h-3" />}
              </Button>
            </label>

            <label className="flex items-center justify-between">
              <span className="text-sm">Color blind friendly</span>
              <Button
                variant={settings.contrast.colorBlindFriendly ? "default" : "outline"}
                size="sm"
                onClick={() => updateSetting('contrast', 'colorBlindFriendly', !settings.contrast.colorBlindFriendly)}
                className="h-6 px-2"
              >
                {settings.contrast.colorBlindFriendly ? <Check className="w-3 h-3" /> : <Palette className="w-3 h-3" />}
              </Button>
            </label>
          </div>
        </div>

        {/* Motion & Animation */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Motion & Animation</h4>
          <label className="flex items-center justify-between">
            <span className="text-sm">Reduce motion</span>
            <Button
              variant={settings.contrast.reduceMotion ? "default" : "outline"}
              size="sm"
              onClick={() => updateSetting('contrast', 'reduceMotion', !settings.contrast.reduceMotion)}
              className="h-6 px-2"
            >
              {settings.contrast.reduceMotion ? <Check className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
            </Button>
          </label>
        </div>

        {/* Text Size */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Text Size</h4>
          <div className="grid grid-cols-3 gap-1">
            {(['normal', 'large', 'extra-large'] as const).map((size) => (
              <Button
                key={size}
                variant={settings.fontSize === size ? "default" : "outline"}
                size="sm"
                onClick={() => updateSetting('fontSize', 'fontSize', size)}
                className="text-xs"
              >
                {size === 'normal' ? 'Normal' : size === 'large' ? 'Large' : 'X-Large'}
              </Button>
            ))}
          </div>
        </div>

        {/* Screen Reader */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Screen Reader</h4>
          <label className="flex items-center justify-between">
            <span className="text-sm">Optimize for screen readers</span>
            <Button
              variant={settings.screenReaderOptimized ? "default" : "outline"}
              size="sm"
              onClick={() => updateSetting('screenReaderOptimized', 'screenReaderOptimized', !settings.screenReaderOptimized)}
              className="h-6 px-2"
            >
              {settings.screenReaderOptimized ? <Check className="w-3 h-3" /> : <Settings className="w-3 h-3" />}
            </Button>
          </label>
        </div>

        {/* Reset */}
        <Button
          variant="outline"
          size="sm"
          onClick={resetToDefaults}
          className="w-full"
        >
          Reset to Defaults
        </Button>
      </CardContent>
    </Card>
  );
}