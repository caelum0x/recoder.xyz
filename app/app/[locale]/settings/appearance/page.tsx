/**
 * Appearance Settings Page
 * Customize theme, font size, density, and visual preferences
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useThemeContext } from '@/components/ThemeProvider';
import {
  ArrowLeft,
  Terminal,
  Sun,
  Moon,
  Monitor,
  Type,
  Layers,
  Palette,
  Sparkles,
  Check,
  Loader2,
  Save
} from 'lucide-react';

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useThemeContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fontSize, setFontSize] = useState('medium');
  const [density, setDensity] = useState('comfortable');
  const [accentColor, setAccentColor] = useState('orange');
  const [reduceAnimations, setReduceAnimations] = useState(false);

  const themes = [
    { value: 'light', label: 'Light', icon: Sun, description: 'Light mode' },
    { value: 'dark', label: 'Dark', icon: Moon, description: 'Dark mode' },
    { value: 'system', label: 'System', icon: Monitor, description: 'Follow system' },
  ] as const;

  const fontSizes = [
    { value: 'small', label: 'Small', size: '14px' },
    { value: 'medium', label: 'Medium', size: '16px' },
    { value: 'large', label: 'Large', size: '18px' },
  ];

  const densities = [
    { value: 'compact', label: 'Compact', description: 'More content, less spacing' },
    { value: 'comfortable', label: 'Comfortable', description: 'Balanced spacing' },
    { value: 'spacious', label: 'Spacious', description: 'More spacing, less content' },
  ];

  const accentColors = [
    { value: 'orange', label: 'Orange', color: 'bg-orange-500' },
    { value: 'blue', label: 'Blue', color: 'bg-blue-500' },
    { value: 'purple', label: 'Purple', color: 'bg-purple-500' },
    { value: 'green', label: 'Green', color: 'bg-green-500' },
    { value: 'pink', label: 'Pink', color: 'bg-pink-500' },
  ];

  // Load appearance settings from API
  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/appearance');
      const data = await response.json();

      if (data.success && data.settings) {
        setFontSize(data.settings.fontSize || 'medium');
        setDensity(data.settings.density || 'comfortable');
        setAccentColor(data.settings.accentColor || 'orange');
        setReduceAnimations(data.settings.reduceAnimations || false);
        // Theme is managed by ThemeContext
      }
    } catch (err) {
      console.error('Failed to load appearance settings:', err);
      setError('Failed to load appearance settings');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch('/api/settings/appearance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          fontSize,
          density,
          accentColor,
          reduceAnimations,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to save appearance settings');
      }
    } catch (err) {
      console.error('Failed to save appearance settings:', err);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
        <div className="max-w-2xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <Palette className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Appearance</h1>
                <p className="text-gray-400">Customize how Recoder looks and feels</p>
              </div>
            </div>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center space-x-3">
              <Check className="w-5 h-5 text-green-500" />
              <span className="text-green-400">Appearance settings saved successfully!</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Theme Selection */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4 flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <span>Theme</span>
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {themes.map((themeOption) => {
                  const Icon = themeOption.icon;
                  const isActive = theme === themeOption.value;
                  
                  return (
                    <button
                      key={themeOption.value}
                      onClick={() => setTheme(themeOption.value)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isActive
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-white/10 hover:border-white/20 bg-white/5'
                      }`}
                    >
                      <Icon className={`w-6 h-6 mx-auto mb-2 ${isActive ? 'text-orange-500' : 'text-gray-400'}`} />
                      <div className="text-sm font-medium">{themeOption.label}</div>
                      <div className="text-xs text-gray-500">{themeOption.description}</div>
                      {isActive && (
                        <Check className="w-4 h-4 text-orange-500 absolute top-2 right-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Size */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4 flex items-center space-x-2">
                <Type className="w-5 h-5 text-blue-500" />
                <span>Font Size</span>
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {fontSizes.map((size) => {
                  const isActive = fontSize === size.value;
                  
                  return (
                    <button
                      key={size.value}
                      onClick={() => setFontSize(size.value)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isActive
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-white/10 hover:border-white/20 bg-white/5'
                      }`}
                    >
                      <div style={{ fontSize: size.size }} className="font-medium mb-1">Aa</div>
                      <div className="text-sm">{size.label}</div>
                      <div className="text-xs text-gray-500">{size.size}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Density */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4 flex items-center space-x-2">
                <Layers className="w-5 h-5 text-green-500" />
                <span>Density</span>
              </h2>
              <div className="space-y-3">
                {densities.map((densityOption) => {
                  const isActive = density === densityOption.value;
                  
                  return (
                    <button
                      key={densityOption.value}
                      onClick={() => setDensity(densityOption.value)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        isActive
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-white/10 hover:border-white/20 bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium mb-1">{densityOption.label}</div>
                          <div className="text-sm text-gray-400">{densityOption.description}</div>
                        </div>
                        {isActive && <Check className="w-5 h-5 text-orange-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Accent Color */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Accent Color</h2>
              <div className="flex items-center space-x-3">
                {accentColors.map((color) => {
                  const isActive = accentColor === color.value;
                  
                  return (
                    <button
                      key={color.value}
                      onClick={() => setAccentColor(color.value)}
                      className={`relative w-12 h-12 rounded-lg ${color.color} hover:scale-110 transition-transform`}
                      title={color.label}
                    >
                      {isActive && (
                        <Check className="w-6 h-6 text-white absolute inset-0 m-auto" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-gray-500 mt-3">
                Select your preferred accent color for buttons and highlights
              </p>
            </div>

            {/* Animations */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Animations</h2>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Reduce animations</div>
                  <div className="text-sm text-gray-400">Minimize motion and transitions</div>
                </div>
                <button
                  onClick={() => setReduceAnimations(!reduceAnimations)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    reduceAnimations ? 'bg-orange-500' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      reduceAnimations ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end space-x-3">
              <Link
                href="/settings"
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
