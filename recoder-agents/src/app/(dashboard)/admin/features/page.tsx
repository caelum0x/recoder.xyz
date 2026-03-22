'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  ToggleLeft,
  RotateCcw,
  Save,
  Info,
} from 'lucide-react';
import { backendApi } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Feature flag definitions
// ---------------------------------------------------------------------------

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  defaultValue: boolean;
}

const FEATURE_FLAGS: FeatureFlag[] = [
  {
    key: 'marketplace_enabled',
    label: 'Marketplace',
    description: 'Show the agent marketplace for discovering and sharing agents.',
    defaultValue: true,
  },
  {
    key: 'workflow_editor',
    label: 'Workflow Editor',
    description: 'Enable the visual workflow editor for building multi-step automations.',
    defaultValue: true,
  },
  {
    key: 'advanced_analytics',
    label: 'Advanced Analytics',
    description: 'Show advanced analytics tabs with detailed usage breakdowns.',
    defaultValue: true,
  },
  {
    key: 'team_collaboration',
    label: 'Team Collaboration',
    description: 'Enable team sharing features for agents and threads.',
    defaultValue: true,
  },
  {
    key: 'webhook_system',
    label: 'Webhook System',
    description: 'Enable webhook management for agent triggers and events.',
    defaultValue: true,
  },
  {
    key: 'global_search',
    label: 'Global Search (CMD+K)',
    description: 'Enable the CMD+K search palette for quick navigation.',
    defaultValue: true,
  },
];

const STORAGE_KEY = 'recoder_feature_flags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFlags(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  // Return defaults
  const defaults: Record<string, boolean> = {};
  FEATURE_FLAGS.forEach((f) => (defaults[f.key] = f.defaultValue));
  return defaults;
}

function saveFlags(flags: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {}
}

async function loadFlagsFromApi(): Promise<Record<string, boolean>> {
  try {
    const res = await backendApi.get<Array<{ preference_key: string; preference_value: any }>>(
      '/preferences?category=general',
      { showErrors: false },
    );
    if (res.success && Array.isArray(res.data)) {
      const PREFIX = 'feature_flag_';
      const apiFlags: Record<string, boolean> = {};
      let found = false;
      for (const row of res.data) {
        if (row.preference_key.startsWith(PREFIX)) {
          const key = row.preference_key.slice(PREFIX.length);
          apiFlags[key] = Boolean(row.preference_value);
          found = true;
        }
      }
      if (found) {
        // Merge with defaults so new flags not yet on server still appear
        const defaults: Record<string, boolean> = {};
        FEATURE_FLAGS.forEach((f) => (defaults[f.key] = f.defaultValue));
        const merged = { ...defaults, ...apiFlags };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
        return merged;
      }
    }
  } catch {
    // API unavailable — fall back to localStorage
  }
  return loadFlags();
}

function saveFlagsToApi(flags: Record<string, boolean>): void {
  const entries = Object.entries(flags).map(([key, value]) => ({
    preference_key: `feature_flag_${key}`,
    preference_value: value,
    category: 'general',
  }));
  backendApi.put('/preferences/batch', { preferences: entries }, { showErrors: false }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminFeaturesPage() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Show cached flags immediately
    setFlags(loadFlags());
    // Then hydrate from API
    loadFlagsFromApi().then((loaded) => setFlags(loaded));
  }, []);

  const handleToggle = useCallback((key: string, value: boolean) => {
    setFlags((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleResetOne = useCallback((key: string) => {
    const def = FEATURE_FLAGS.find((f) => f.key === key);
    if (def) {
      setFlags((prev) => ({ ...prev, [key]: def.defaultValue }));
      setSaved(false);
    }
  }, []);

  const handleSave = useCallback(() => {
    saveFlags(flags);
    saveFlagsToApi(flags);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [flags]);

  const handleResetAll = useCallback(() => {
    const defaults: Record<string, boolean> = {};
    FEATURE_FLAGS.forEach((f) => (defaults[f.key] = f.defaultValue));
    setFlags(defaults);
    saveFlags(defaults);
    saveFlagsToApi(defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Feature Flags</h2>
          <p className="text-xs text-muted-foreground">
            Toggle platform features on or off
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetAll}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <RotateCcw className="h-3 w-3" />
            Reset All
          </button>
          <button
            onClick={handleSave}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors',
              saved
                ? 'bg-emerald-500 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            <Save className="h-3 w-3" />
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-50 p-4 dark:bg-blue-950/20">
        <Info className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Feature flags are stored locally in your browser and apply only to
          this device. They are intended for development and testing purposes.
        </p>
      </div>

      {/* Flag list */}
      <div className="space-y-2">
        {FEATURE_FLAGS.map((flag) => (
          <div
            key={flag.key}
            className="flex items-center justify-between rounded-xl border bg-card p-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <ToggleLeft className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{flag.label}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {flag.description}
                </p>
                <p className="mt-0.5 text-[10px] font-mono text-muted-foreground/60">
                  {flag.key}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <button
                onClick={() => handleResetOne(flag.key)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                title="Reset to default"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <Toggle
                checked={flags[flag.key] ?? flag.defaultValue}
                onChange={(v) => handleToggle(flag.key, v)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
