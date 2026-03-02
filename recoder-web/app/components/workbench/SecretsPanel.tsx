/**
 * SecretsPanel - Visual .env editor with encryption
 * Manages environment variables across multiple environments
 */

import { memo, useCallback, useEffect, useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerPost, dockerGet, dockerDelete } from '~/lib/services/docker-api';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
import {
  secretsAtom,
  currentEnvironmentAtom,
  isLoadingSecretsAtom,
  secretsErrorAtom,
  showSecretsAtom,
  editingSecretAtom,
  setSecrets,
  setCurrentEnvironment,
  setSecretsLoading,
  setSecretsError,
  toggleShowSecrets,
  setEditingSecret,
  upsertSecret,
  removeSecret,
  type Secret,
} from '~/lib/stores/secrets';

const logger = createScopedLogger('SecretsPanel');

interface SecretsPanelProps {
  className?: string;
}

const ENVIRONMENTS = [
  { value: 'development', label: 'Development', file: '.env' },
  { value: 'local', label: 'Local', file: '.env.local' },
  { value: 'production', label: 'Production', file: '.env.production' },
  { value: 'test', label: 'Test', file: '.env.test' },
] as const;

export const SecretsPanel = memo(({ className = '' }: SecretsPanelProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  const secrets = useStore(secretsAtom);
  const currentEnvironment = useStore(currentEnvironmentAtom);
  const isLoading = useStore(isLoadingSecretsAtom);
  const secretsError = useStore(secretsErrorAtom);
  const showSecrets = useStore(showSecretsAtom);
  const editingSecret = useStore(editingSecretAtom);

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter secrets by current environment
  const filteredSecrets = secrets.filter((s) => s.environment === currentEnvironment);

  // Load secrets when container is ready
  useEffect(() => {
    if (containerReady && projectId) {
      loadSecrets();
    }
  }, [containerReady, projectId, currentEnvironment]);

  // Focus input when add form is shown
  useEffect(() => {
    if (showAddForm) {
      inputRef.current?.focus();
    }
  }, [showAddForm]);

  // Load secrets from container
  const loadSecrets = useCallback(async () => {
    if (!projectId) return;

    setSecretsLoading(true);
    setSecretsError(null);

    try {
      const data = await dockerGet<{ secrets?: Secret[]; error?: string }>(`/api/secrets/${projectId}?environment=${currentEnvironment}`);
      if (data.secrets) {
        // Merge with existing secrets from other environments
        const otherEnvSecrets = secrets.filter((s) => s.environment !== currentEnvironment);
        setSecrets([...otherEnvSecrets, ...data.secrets]);
      } else if (data.error) {
        setSecretsError(data.error);
      }
    } catch (error: unknown) {
      logger.error('[Secrets] Load error:', error);
      // Don't show error for expected 404 (no .env file yet)
    } finally {
      setSecretsLoading(false);
    }
  }, [projectId, currentEnvironment, secrets]);

  // Add a new secret
  const handleAddSecret = useCallback(async () => {
    if (!projectId || !newKey.trim()) return;

    try {
      await dockerPost<{ error?: string }>(`/api/secrets/${projectId}`, {
        key: newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        value: newValue,
        environment: currentEnvironment,
      });

      upsertSecret({
        key: newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        value: newValue,
        masked: true,
        environment: currentEnvironment,
      });
      toast.success(`Added ${newKey}`);
      setNewKey('');
      setNewValue('');
      setShowAddForm(false);
    } catch (error) {
      toast.error('Failed to add secret');
    }
  }, [projectId, newKey, newValue, currentEnvironment]);

  // Update a secret
  const handleUpdateSecret = useCallback(async (key: string, value: string) => {
    if (!projectId) return;

    try {
      await dockerPost(`/api/secrets/${projectId}`, {
        key,
        value,
        environment: currentEnvironment,
      });

      upsertSecret({
        key,
        value,
        masked: true,
        environment: currentEnvironment,
      });
      setEditingSecret(null);
      toast.success(`Updated ${key}`);
    } catch (error) {
      toast.error('Failed to update secret');
    }
  }, [projectId, currentEnvironment]);

  // Delete a secret
  const handleDeleteSecret = useCallback(async (key: string) => {
    if (!projectId) return;
    if (!confirm(`Delete ${key}?`)) return;

    try {
      await dockerDelete(`/api/secrets/${projectId}/${encodeURIComponent(key)}?environment=${currentEnvironment}`);
      removeSecret(key, currentEnvironment);
      toast.success(`Deleted ${key}`);
    } catch (error) {
      toast.error('Failed to delete secret');
    }
  }, [projectId, currentEnvironment]);

  // Export as .env file
  const handleExport = useCallback(() => {
    const content = filteredSecrets
      .map((s) => `${s.key}=${s.value}`)
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ENVIRONMENTS.find(e => e.value === currentEnvironment)?.file || '.env';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported environment variables');
  }, [filteredSecrets, currentEnvironment]);

  // Import from .env file
  const handleImport = useCallback(async (file: File) => {
    const content = await file.text();
    const lines = content.split('\n');
    let imported = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();

        // Remove surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        try {
          await dockerPost(`/api/secrets/${projectId}`, {
            key,
            value,
            environment: currentEnvironment,
          });

          upsertSecret({
            key,
            value,
            masked: true,
            environment: currentEnvironment,
          });
          imported++;
        } catch (error) {
          // Continue with other keys
        }
      }
    }

    toast.success(`Imported ${imported} variables`);
  }, [projectId, currentEnvironment]);

  return (
    <div className={`flex flex-col h-full bg-recoder-elements-background-depth-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-recoder-elements-borderColor">
        <div className="flex items-center gap-2">
          <span className="i-ph:key text-yellow-400" />
          <span className="font-medium text-recoder-elements-textPrimary text-sm">
            Environment Variables
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleShowSecrets}
            className={classNames(
              'p-1.5 rounded transition-colors',
              showSecrets ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-recoder-elements-background-depth-3'
            )}
            title={showSecrets ? 'Hide values' : 'Show values'}
          >
            <span className={showSecrets ? 'i-ph:eye-slash' : 'i-ph:eye'} />
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={classNames(
              'p-1.5 rounded transition-colors',
              showAddForm ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-recoder-elements-background-depth-3'
            )}
            title="Add Variable"
          >
            <span className="i-ph:plus" />
          </button>
          <button
            onClick={loadSecrets}
            disabled={isLoading}
            className="p-1.5 hover:bg-recoder-elements-background-depth-3 rounded"
            title="Refresh"
          >
            <span className={classNames('i-ph:arrows-clockwise', isLoading ? 'animate-spin' : '')} />
          </button>
        </div>
      </div>

      {/* Environment Tabs */}
      <div className="flex border-b border-recoder-elements-borderColor overflow-x-auto">
        {ENVIRONMENTS.map((env) => (
          <button
            key={env.value}
            onClick={() => setCurrentEnvironment(env.value)}
            className={classNames(
              'px-3 py-1.5 text-xs whitespace-nowrap transition-colors',
              currentEnvironment === env.value
                ? 'text-recoder-elements-textPrimary border-b-2 border-yellow-500 bg-recoder-elements-background-depth-2'
                : 'text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary'
            )}
          >
            {env.label}
            <span className="ml-1 text-recoder-elements-textTertiary">
              ({secrets.filter(s => s.environment === env.value).length})
            </span>
          </button>
        ))}
      </div>

      {/* Add Secret Form */}
      {showAddForm && (
        <div className="p-3 border-b border-recoder-elements-borderColor bg-recoder-elements-background-depth-2">
          <div className="flex gap-2 mb-2">
            <input
              ref={inputRef}
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              placeholder="KEY_NAME"
              className="flex-1 px-2 py-1.5 text-xs bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded focus:border-blue-500 focus:outline-none text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary font-mono"
            />
          </div>
          <div className="flex gap-2">
            <input
              type={showSecrets ? 'text' : 'password'}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="value"
              className="flex-1 px-2 py-1.5 text-xs bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded focus:border-blue-500 focus:outline-none text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleAddSecret()}
            />
            <button
              onClick={handleAddSecret}
              disabled={!newKey.trim()}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewKey('');
                setNewValue('');
              }}
              className="px-3 py-1.5 text-xs bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-2 rounded text-recoder-elements-textPrimary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Secrets List */}
      <div className="flex-1 overflow-auto">
        {!containerReady ? (
          <div className="p-4 text-center text-recoder-elements-textTertiary text-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500 mx-auto mb-2" />
            Waiting for container...
          </div>
        ) : isLoading ? (
          <div className="p-4 text-center text-recoder-elements-textTertiary text-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500 mx-auto mb-2" />
            Loading secrets...
          </div>
        ) : filteredSecrets.length === 0 ? (
          <div className="p-4 text-center text-recoder-elements-textTertiary text-sm">
            <span className="i-ph:key text-2xl block mb-2" />
            No environment variables
            <button
              onClick={() => setShowAddForm(true)}
              className="block mx-auto mt-2 text-blue-400 hover:underline"
            >
              Add a variable
            </button>
          </div>
        ) : (
          filteredSecrets.map((secret) => (
            <SecretItem
              key={secret.key}
              secret={secret}
              isEditing={editingSecret === secret.key}
              showValue={showSecrets}
              onEdit={() => setEditingSecret(secret.key)}
              onSave={(value) => handleUpdateSecret(secret.key, value)}
              onCancel={() => setEditingSecret(null)}
              onDelete={() => handleDeleteSecret(secret.key)}
            />
          ))
        )}
      </div>

      {/* Footer Actions */}
      {filteredSecrets.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-recoder-elements-borderColor bg-recoder-elements-background-depth-2">
          <span className="text-xs text-recoder-elements-textTertiary">
            {filteredSecrets.length} variable{filteredSecrets.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <label className="px-2 py-1 text-xs bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-2 rounded text-recoder-elements-textPrimary cursor-pointer">
              Import
              <input
                type="file"
                accept=".env,.env.*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
              />
            </label>
            <button
              onClick={handleExport}
              className="px-2 py-1 text-xs bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-2 rounded text-recoder-elements-textPrimary"
            >
              Export
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

SecretsPanel.displayName = 'SecretsPanel';

// Individual secret item
interface SecretItemProps {
  secret: Secret;
  isEditing: boolean;
  showValue: boolean;
  onEdit: () => void;
  onSave: (value: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}

const SecretItem = memo(({ secret, isEditing, showValue, onEdit, onSave, onCancel, onDelete }: SecretItemProps) => {
  const [editValue, setEditValue] = useState(secret.value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setEditValue(secret.value);
      inputRef.current?.focus();
    }
  }, [isEditing, secret.value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSave(editValue);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-recoder-elements-background-depth-2 border-b border-recoder-elements-borderColor group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-yellow-400 font-medium">
            {secret.key}
          </span>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-2 py-1 text-xs bg-recoder-elements-background-depth-3 border border-blue-500 rounded focus:outline-none text-recoder-elements-textPrimary font-mono"
            />
            <button
              onClick={() => onSave(editValue)}
              className="p-1 text-green-400 hover:bg-recoder-elements-background-depth-3 rounded"
            >
              <span className="i-ph:check" />
            </button>
            <button
              onClick={onCancel}
              className="p-1 text-red-400 hover:bg-recoder-elements-background-depth-3 rounded"
            >
              <span className="i-ph:x" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-xs text-recoder-elements-textSecondary truncate">
              {showValue ? secret.value : '••••••••'}
            </span>
          </div>
        )}
      </div>
      {!isEditing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1 hover:bg-recoder-elements-background-depth-3 rounded text-recoder-elements-textTertiary"
            title="Edit"
          >
            <span className="i-ph:pencil" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-recoder-elements-background-depth-3 rounded text-red-400"
            title="Delete"
          >
            <span className="i-ph:trash" />
          </button>
        </div>
      )}
    </div>
  );
});

SecretItem.displayName = 'SecretItem';

export default SecretsPanel;
