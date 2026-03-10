import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Shield,
  Settings,
  Trash2,
  Star,
  Clock,
  Key
} from 'lucide-react';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { toast } from '@/lib/toast';
import { ComposioCredentialProfileSelector } from '@/components/agents/composio/composio-credential-profile-selector';
import { ComposioConnector } from '@/components/agents/composio/composio-connector';
import {
  useCreateCredentialProfile,
  useCredentialProfilesForMcp,
  useDeleteCredentialProfile,
  useSetDefaultProfile,
  type CreateCredentialProfileRequest,
  type CredentialProfile,
} from '@/hooks/mcp/use-credential-profiles';
import { useMCPServerDetails } from '@/hooks/mcp/use-mcp-servers';
import { useComposioToolkits } from '@/hooks/composio/use-composio';
import type { SetupStep } from './types';

// Format relative time
function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never used';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// MCP credential profile selector for non-Composio MCPs
const McpProfileSelector: React.FC<{
  step: SetupStep;
  selectedProfileId: string | undefined;
  onProfileSelect: (qualifiedName: string, profileId: string | null) => void;
  onComplete?: () => void;
  onCreateNew: () => void;
}> = ({ step, selectedProfileId, onProfileSelect, onComplete, onCreateNew }) => {
  const { data: profiles, isLoading } = useCredentialProfilesForMcp(step.qualified_name);
  const deleteProfile = useDeleteCredentialProfile();
  const setDefault = useSetDefaultProfile();

  const handleDelete = useCallback((e: React.MouseEvent, profileId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this credential profile?')) return;
    deleteProfile.mutate(profileId);
    // If deleting the selected profile, clear selection
    if (selectedProfileId === profileId) {
      onProfileSelect(step.id, null);
    }
  }, [deleteProfile, selectedProfileId, onProfileSelect, step.id]);

  const handleSetDefault = useCallback((e: React.MouseEvent, profileId: string) => {
    e.stopPropagation();
    setDefault.mutate(profileId);
  }, [setDefault]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <RecoderLoader customSize={20} />
      </div>
    );
  }

  const hasProfiles = profiles && profiles.length > 0;

  return (
    <div className="space-y-4">
      {hasProfiles ? (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Select a credential profile</Label>
          {profiles.map((profile: CredentialProfile) => (
            <div
              key={profile.profile_id}
              className={`group relative w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                selectedProfileId === profile.profile_id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent/50'
              }`}
              onClick={() => {
                onProfileSelect(step.id, profile.profile_id);
                onComplete?.();
              }}
            >
              <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{profile.profile_name || profile.display_name}</p>
                  {profile.is_default && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      <Star className="h-2.5 w-2.5" />
                      Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {profile.config_keys && profile.config_keys.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Key className="h-2.5 w-2.5" />
                      {profile.config_keys.length} key{profile.config_keys.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {formatRelativeTime(profile.last_used_at)}
                  </span>
                </div>
              </div>

              {/* Action buttons - show on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                {!profile.is_default && (
                  <button
                    type="button"
                    onClick={(e) => handleSetDefault(e, profile.profile_id)}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
                    title="Set as default"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, profile.profile_id)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete profile"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Alert className="border-primary/20 bg-primary/5">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            No credential profiles found for {step.service_name}. Create one to connect.
          </AlertDescription>
        </Alert>
      )}

      <Button
        variant={hasProfiles ? 'outline' : 'default'}
        onClick={onCreateNew}
        className="w-full"
      >
        <Plus className="h-4 w-4" />
        {hasProfiles ? 'Create Another Profile' : `Create ${step.service_name} Profile`}
      </Button>
    </div>
  );
};

interface ProfileConnectorProps {
  step: SetupStep;
  selectedProfileId: string | undefined;
  onProfileSelect: (qualifiedName: string, profileId: string | null) => void;
  onComplete?: () => void;
}

export const ProfileConnector: React.FC<ProfileConnectorProps> = ({
  step,
  selectedProfileId,
  onProfileSelect,
  onComplete
}) => {
  const [profileStep, setProfileStep] = useState<'select' | 'create'>('select');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [showComposioConnector, setShowComposioConnector] = useState(false);

  const createProfileMutation = useCreateCredentialProfile();
  const { data: serverDetails } = useMCPServerDetails(
    step.qualified_name,
    !step.qualified_name?.startsWith('composio.')
  );
  
  const isComposioStep = step.type === 'composio_profile';
  
  const composioQualifiedName = React.useMemo(() => {
    if (!isComposioStep) return null;
    
    // Handle different cases:
    // 1. Generic 'composio' (from triggers) - use 'composio' as the qualified name
    // 2. Specific app like 'composio.gmail' - already formatted correctly
    // 3. App slug like 'gmail' - format as 'composio.gmail'
    if (step.qualified_name === 'composio') {
      return 'composio';
    } else if (step.qualified_name?.startsWith('composio.')) {
      return step.qualified_name;
    } else if (step.app_slug && step.app_slug !== 'composio') {
      return `composio.${step.app_slug}`;
    }
    return 'composio';
  }, [isComposioStep, step.app_slug, step.qualified_name]);
  
  const { data: composioProfiles } = useCredentialProfilesForMcp(composioQualifiedName);
  
  const { data: composioToolkits } = useComposioToolkits(
    isComposioStep && step.app_slug !== 'composio' ? step.app_slug : undefined,
    undefined
  );
  const configProperties = serverDetails?.connections?.[0]?.configSchema?.properties || {};
  const requiredFields = serverDetails?.connections?.[0]?.configSchema?.required || [];
  
  const hasConnectedComposioProfile = composioProfiles && composioProfiles.length > 0;

  useEffect(() => {
    setProfileStep('select');
    setIsCreatingProfile(false);
    setNewProfileName('');
    setConfig({});
    setShowComposioConnector(false);
  }, [step.qualified_name]);

  const composioAppConfig = useMemo(() => {
    const actualToolkit = composioToolkits?.toolkits?.find(t => t.slug === step.app_slug);
    return actualToolkit || {
      slug: step.app_slug || step.qualified_name,
      name: step.service_name,
      description: `Connect your ${step.service_name} account to use its tools`,
      logo: '',
      tags: [],
      auth_schemes: ['OAUTH2'],
      categories: []
    };
  }, [step.app_slug, step.qualified_name, step.service_name, composioToolkits]);

  const handleCreateProfile = useCallback(async () => {
    if (!newProfileName.trim()) {
      toast.error('Please enter a profile name');
      return;
    }

    setIsCreatingProfile(true);
    try {
      const request: CreateCredentialProfileRequest = {
        mcp_qualified_name: step.qualified_name,
        profile_name: newProfileName.trim(),
        display_name: step.service_name,
        config: config,
        is_default: false
      };

      const response = await createProfileMutation.mutateAsync(request);
      
      if (response.profile_id) {
        toast.success('Profile created successfully');
        // Use step.id instead of step.qualified_name to support trigger-specific profiles
        onProfileSelect(step.id, response.profile_id || 'new-profile');
        onComplete?.();
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      toast.error('Failed to create profile');
    } finally {
      setIsCreatingProfile(false);
    }
  }, [newProfileName, config, step.id, step.qualified_name, step.service_name, createProfileMutation, onProfileSelect, onComplete]);

  const handleConfigChange = useCallback((key: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const handleProfileNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewProfileName(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && profileStep === 'create') {
      handleCreateProfile();
    }
  }, [handleCreateProfile, profileStep]);

  const isFieldRequired = (fieldName: string) => {
    return requiredFields.includes(fieldName);
  };

    const SelectProfileStep = useMemo(() => (
    <div className="space-y-4">
      {isComposioStep ? (
        <div className="space-y-4">
          {hasConnectedComposioProfile ? (
            <ComposioCredentialProfileSelector
              toolkitSlug={step.app_slug || ''}
              toolkitName={step.service_name}
              selectedProfileId={selectedProfileId}
              onProfileSelect={(profileId) => {
                // Use step.id to support trigger-specific profiles
                onProfileSelect(step.id, profileId);
                if (profileId) {
                  onComplete?.();
                }
              }}
            />
          ) : (
            <div className="space-y-4">
              <Alert className="border-primary/20 bg-primary/5">
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  No connected {step.service_name} profiles found. Create and connect one to continue.
                </AlertDescription>
              </Alert>
              
              <Button 
                onClick={() => setShowComposioConnector(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4" />
                Connect {step.service_name}
              </Button>
            </div>
          )}

          {hasConnectedComposioProfile && (
            <>
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">OR</span>
                <Separator className="flex-1" />
              </div>

              <Button 
                variant="outline" 
                onClick={() => setShowComposioConnector(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4" />
                Connect Different Account
              </Button>
            </>
          )}
        </div>
      ) : (
        <McpProfileSelector
          step={step}
          selectedProfileId={selectedProfileId}
          onProfileSelect={onProfileSelect}
          onComplete={onComplete}
          onCreateNew={() => {
            setNewProfileName(`${step.service_name} Profile`);
            setProfileStep('create');
          }}
        />
      )}
    </div>
  ), [
    step.service_name,
    step.qualified_name,
    step.app_slug,
    isComposioStep,
    selectedProfileId,
    hasConnectedComposioProfile,
    onProfileSelect,
    onComplete
  ]);

  const CreateProfileStep = useMemo(() => (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Button 
            variant="link" 
            size="sm"
            onClick={() => setProfileStep('select')}
            className="mb-4 p-0 h-auto font-normal text-muted-foreground hover:text-foreground"
          >
            ← Back to Selection
          </Button>
        </div>
        <h3 className="font-semibold">Create {step.service_name} Profile</h3>
        <p className="text-sm text-muted-foreground">
          Set up a new credential profile for {step.service_name}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Profile Name</Label>
          <Input
            id="profile-name"
            placeholder="e.g., Personal Account, Work Account"
            value={newProfileName}
            onChange={handleProfileNameChange}
            onKeyDown={handleKeyDown}
            autoFocus
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            This helps you identify different configurations
          </p>
        </div>

        {Object.keys(configProperties).length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="text-sm font-medium">Connection Settings</span>
            </div>
            {Object.entries(configProperties).map(([key, schema]: [string, any]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>
                  {schema.title || key}
                  {isFieldRequired(key) && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </Label>
                <Input
                  id={key}
                  type={schema.format === 'password' ? 'password' : 'text'}
                  placeholder={schema.description || `Enter ${key}`}
                  value={config[key] || ''}
                  onChange={(e) => handleConfigChange(key, e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-11"
                />
                {schema.description && (
                  <p className="text-xs text-muted-foreground">{schema.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Alert className="border-primary/20 bg-primary/5">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              This service doesn't require any credentials to connect.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="pt-4 border-t">
        <Button 
          onClick={handleCreateProfile}
          disabled={!newProfileName.trim() || isCreatingProfile}
          className="w-full"
        >
          {isCreatingProfile ? (
            <>
              <RecoderLoader customSize={16} className="mr-1" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Create & Continue
            </>
          )}
        </Button>
      </div>
    </div>
  ), [
    step.service_name,
    newProfileName,
    config,
    configProperties,
    isCreatingProfile,
    handleProfileNameChange,
    handleKeyDown,
    handleConfigChange,
    handleCreateProfile,
    isFieldRequired
  ]);

  return (
    <>
      <div className="space-y-6">
        {profileStep === 'select' ? SelectProfileStep : CreateProfileStep}
      </div>

      {isComposioStep && (
        <ComposioConnector
          app={composioAppConfig}
          open={showComposioConnector}
          onOpenChange={setShowComposioConnector}
          mode="profile-only"
          onComplete={(profileId, appName, appSlug) => {
            // Use step.id to support trigger-specific profiles
            onProfileSelect(step.id, profileId);
            setShowComposioConnector(false);
            onComplete?.();
          }}
        />
      )}
    </>
  );
}; 