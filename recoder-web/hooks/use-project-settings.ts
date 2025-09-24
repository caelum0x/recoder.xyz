import { useState, useEffect, useCallback } from 'react';

interface ProjectSettings {
  general: {
    name: string;
    description: string;
    framework: string;
    template: string;
    tags: string[];
    visibility: 'private' | 'public' | 'team';
  };
  development: {
    packageManager: 'npm' | 'yarn' | 'pnpm';
    nodeVersion: string;
    autoSave: boolean;
    autoFormat: boolean;
    linting: boolean;
    typeChecking: boolean;
    hotReload: boolean;
  };
  deployment: {
    platforms: string[];
    buildCommand: string;
    outputDirectory: string;
    environmentVariables: Record<string, string>;
    domains: string[];
    autoDeployment: boolean;
    branchDeployment: Record<string, string>;
  };
  collaboration: {
    enabled: boolean;
    allowedUsers: string[];
    permissions: Record<string, 'read' | 'write' | 'admin'>;
    realTimeEditing: boolean;
    commentsEnabled: boolean;
    shareableLinks: boolean;
  };
  security: {
    accessControl: 'open' | 'invite' | 'restricted';
    twoFactorRequired: boolean;
    ipWhitelist: string[];
    sessionTimeout: number;
    auditLogging: boolean;
  };
  integrations: {
    git: {
      provider: 'github' | 'gitlab' | 'bitbucket' | null;
      repository: string;
      branch: string;
      autoSync: boolean;
      webhooks: boolean;
    };
    ci: {
      enabled: boolean;
      provider: 'github-actions' | 'gitlab-ci' | 'vercel' | null;
      configFile: string;
    };
    analytics: {
      enabled: boolean;
      provider: 'google' | 'vercel' | 'custom' | null;
      trackingId: string;
    };
  };
  performance: {
    buildOptimization: boolean;
    bundleAnalysis: boolean;
    caching: boolean;
    compression: boolean;
    cdn: boolean;
    monitoring: boolean;
  };
}

export const useProjectSettings = (projectId: string) => {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}/settings`);
      const data = await response.json();

      if (data.success) {
        setSettings(data.data.settings);
        setUnsavedChanges(false);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load project settings');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const updateSettings = useCallback(async (newSettings: Partial<ProjectSettings>) => {
    if (!settings) return;

    const updatedSettings = {
      ...settings,
      ...newSettings
    };

    setSettings(updatedSettings);
    setUnsavedChanges(true);
  }, [settings]);

  const saveSettings = useCallback(async () => {
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });

      const data = await response.json();

      if (data.success) {
        setUnsavedChanges(false);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to save project settings');
    } finally {
      setSaving(false);
    }
  }, [projectId, settings]);

  const resetSettings = useCallback(() => {
    loadSettings();
  }, [loadSettings]);

  const updateGeneralSettings = useCallback((general: Partial<ProjectSettings['general']>) => {
    updateSettings({ general: { ...settings?.general, ...general } as ProjectSettings['general'] });
  }, [settings, updateSettings]);

  const updateDevelopmentSettings = useCallback((development: Partial<ProjectSettings['development']>) => {
    updateSettings({ development: { ...settings?.development, ...development } as ProjectSettings['development'] });
  }, [settings, updateSettings]);

  const updateDeploymentSettings = useCallback((deployment: Partial<ProjectSettings['deployment']>) => {
    updateSettings({ deployment: { ...settings?.deployment, ...deployment } as ProjectSettings['deployment'] });
  }, [settings, updateSettings]);

  const updateCollaborationSettings = useCallback((collaboration: Partial<ProjectSettings['collaboration']>) => {
    updateSettings({ collaboration: { ...settings?.collaboration, ...collaboration } as ProjectSettings['collaboration'] });
  }, [settings, updateSettings]);

  const updateSecuritySettings = useCallback((security: Partial<ProjectSettings['security']>) => {
    updateSettings({ security: { ...settings?.security, ...security } as ProjectSettings['security'] });
  }, [settings, updateSettings]);

  const updateIntegrationSettings = useCallback((integrations: Partial<ProjectSettings['integrations']>) => {
    updateSettings({ integrations: { ...settings?.integrations, ...integrations } as ProjectSettings['integrations'] });
  }, [settings, updateSettings]);

  const updatePerformanceSettings = useCallback((performance: Partial<ProjectSettings['performance']>) => {
    updateSettings({ performance: { ...settings?.performance, ...performance } as ProjectSettings['performance'] });
  }, [settings, updateSettings]);

  const exportSettings = useCallback(() => {
    if (!settings) return null;

    const exportData = {
      version: '1.0',
      projectId,
      settings,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settings.general.name}-settings.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return null;
  }, [projectId, settings]);

  const importSettings = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.version && data.settings) {
        setSettings(data.settings);
        setUnsavedChanges(true);
        return { success: true };
      } else {
        return { success: false, error: 'Invalid settings file format' };
      }
    } catch (error) {
      return { success: false, error: 'Failed to parse settings file' };
    }
  }, []);

  const validateSettings = useCallback(() => {
    if (!settings) return { valid: false, errors: ['Settings not loaded'] };

    const errors: string[] = [];

    // Validate general settings
    if (!settings.general.name?.trim()) {
      errors.push('Project name is required');
    }

    if (!settings.general.framework) {
      errors.push('Framework selection is required');
    }

    // Validate deployment settings
    if (settings.deployment.platforms.length === 0) {
      errors.push('At least one deployment platform must be selected');
    }

    if (!settings.deployment.buildCommand?.trim()) {
      errors.push('Build command is required');
    }

    // Validate integrations
    if (settings.integrations.git.provider && !settings.integrations.git.repository) {
      errors.push('Git repository URL is required when Git provider is selected');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }, [settings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsavedChanges]);

  return {
    settings,
    loading,
    saving,
    error,
    unsavedChanges,
    loadSettings,
    updateSettings,
    saveSettings,
    resetSettings,
    updateGeneralSettings,
    updateDevelopmentSettings,
    updateDeploymentSettings,
    updateCollaborationSettings,
    updateSecuritySettings,
    updateIntegrationSettings,
    updatePerformanceSettings,
    exportSettings,
    importSettings,
    validateSettings
  };
};
