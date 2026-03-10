'use client';

import React, { useState, useEffect, useCallback, KeyboardEvent } from 'react';
import {
  useKeyScopes,
  useSetKeyScopes,
  useKeyRestrictions,
  useSetKeyRestrictions,
} from '@/hooks/developers/use-api-key-scopes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Shield, Key, Globe, Clock, Save, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Scope definitions
// ---------------------------------------------------------------------------

interface ScopeGroup {
  label: string;
  scopes: string[];
}

const SCOPE_GROUPS: ScopeGroup[] = [
  {
    label: 'Read',
    scopes: ['agents:read', 'threads:read', 'kb:read', 'billing:read', 'search:read'],
  },
  {
    label: 'Write',
    scopes: ['agents:write', 'threads:write', 'kb:write'],
  },
  {
    label: 'Execute',
    scopes: ['runs:execute'],
  },
  {
    label: 'Manage',
    scopes: ['webhooks:manage', 'admin:all'],
  },
];

const ALL_READ_SCOPES = SCOPE_GROUPS.find((g) => g.label === 'Read')!.scopes;
const ALL_WRITE_SCOPES = SCOPE_GROUPS.find((g) => g.label === 'Write')!.scopes;

// ---------------------------------------------------------------------------
// Tag Input sub-component
// ---------------------------------------------------------------------------

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

function TagInput({ values, onChange, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        e.preventDefault();
        const trimmed = inputValue.trim();
        if (!values.includes(trimmed)) {
          onChange([...values, trimmed]);
        }
        setInputValue('');
      }
    },
    [inputValue, values, onChange]
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(values.filter((v) => v !== tag));
    },
    [values, onChange]
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <Badge key={tag} variant="secondary" className="flex items-center gap-1 text-xs">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface KeyScopeEditorProps {
  keyId: string;
}

export function KeyScopeEditor({ keyId }: KeyScopeEditorProps) {
  // --- Scopes state ---
  const { data: scopesData, isLoading: scopesLoading } = useKeyScopes(keyId);
  const setScopesMutation = useSetKeyScopes();
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (scopesData?.scopes) {
      setSelectedScopes(new Set(scopesData.scopes));
    }
  }, [scopesData]);

  // --- Restrictions state ---
  const { data: restrictionsData, isLoading: restrictionsLoading } = useKeyRestrictions(keyId);
  const setRestrictionsMutation = useSetKeyRestrictions();

  const [allowedIps, setAllowedIps] = useState<string[]>([]);
  const [allowedAgents, setAllowedAgents] = useState<string[]>([]);
  const [rateLimitOverride, setRateLimitOverride] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');

  useEffect(() => {
    if (restrictionsData) {
      setAllowedIps(restrictionsData.allowed_ips || []);
      setAllowedAgents(restrictionsData.allowed_agents || []);
      setRateLimitOverride(
        restrictionsData.rate_limit_override != null
          ? String(restrictionsData.rate_limit_override)
          : ''
      );
      setExpiresAt(
        restrictionsData.expires_at
          ? restrictionsData.expires_at.split('T')[0]
          : ''
      );
    }
  }, [restrictionsData]);

  // --- Scope toggle helpers ---
  const toggleScope = useCallback((scope: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }, []);

  const selectAllRead = useCallback(() => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      ALL_READ_SCOPES.forEach((s) => next.add(s));
      return next;
    });
  }, []);

  const selectAllWrite = useCallback(() => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      ALL_WRITE_SCOPES.forEach((s) => next.add(s));
      return next;
    });
  }, []);

  // --- Save handlers ---
  const handleSaveScopes = useCallback(() => {
    setScopesMutation.mutate({
      keyId,
      scopes: Array.from(selectedScopes),
    });
  }, [keyId, selectedScopes, setScopesMutation]);

  const handleSaveRestrictions = useCallback(() => {
    setRestrictionsMutation.mutate({
      keyId,
      data: {
        allowed_ips: allowedIps,
        allowed_agents: allowedAgents,
        rate_limit_override: rateLimitOverride ? parseInt(rateLimitOverride, 10) : null,
        expires_at: expiresAt || null,
      },
    });
  }, [keyId, allowedIps, allowedAgents, rateLimitOverride, expiresAt, setRestrictionsMutation]);

  const isLoading = scopesLoading || restrictionsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center text-sm text-muted-foreground">
            Loading key configuration...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scopes Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">API Key Scopes</CardTitle>
          </div>
          <CardDescription>
            Control what this API key can access. Select the permissions this key needs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick select buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAllRead}>
              Select All Read
            </Button>
            <Button variant="outline" size="sm" onClick={selectAllWrite}>
              Select All Write
            </Button>
          </div>

          <Separator />

          {/* Scope groups */}
          <div className="space-y-5">
            {SCOPE_GROUPS.map((group) => (
              <div key={group.label}>
                <Label className="mb-2 block text-sm font-semibold">{group.label}</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.scopes.map((scope) => (
                    <label
                      key={scope}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedScopes.has(scope)}
                        onCheckedChange={() => toggleScope(scope)}
                      />
                      <Key className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveScopes}
              disabled={setScopesMutation.isPending}
              size="sm"
            >
              <Save className="mr-1.5 h-4 w-4" />
              {setScopesMutation.isPending ? 'Saving...' : 'Save Scopes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Restrictions Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Restrictions</CardTitle>
          </div>
          <CardDescription>
            Set IP allowlists, agent restrictions, rate limits, and key expiration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Allowed IPs */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Globe className="h-3.5 w-3.5" />
              Allowed IPs
            </Label>
            <p className="text-xs text-muted-foreground">
              Type an IP address and press Enter. Leave empty to allow all.
            </p>
            <TagInput
              values={allowedIps}
              onChange={setAllowedIps}
              placeholder="e.g. 192.168.1.0"
            />
          </div>

          <Separator />

          {/* Allowed Agents */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Key className="h-3.5 w-3.5" />
              Allowed Agents
            </Label>
            <p className="text-xs text-muted-foreground">
              Restrict this key to specific agent IDs. Leave empty to allow all.
            </p>
            <TagInput
              values={allowedAgents}
              onChange={setAllowedAgents}
              placeholder="Agent ID"
            />
          </div>

          <Separator />

          {/* Rate limit override */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Shield className="h-3.5 w-3.5" />
              Rate Limit Override (requests/minute)
            </Label>
            <Input
              type="number"
              value={rateLimitOverride}
              onChange={(e) => setRateLimitOverride(e.target.value)}
              placeholder="Leave empty for default"
              className="h-8 w-48 text-sm"
              min={1}
            />
          </div>

          <Separator />

          {/* Expiry date */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Clock className="h-3.5 w-3.5" />
              Expiry Date
            </Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-8 w-48 text-sm"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveRestrictions}
              disabled={setRestrictionsMutation.isPending}
              size="sm"
            >
              <Save className="mr-1.5 h-4 w-4" />
              {setRestrictionsMutation.isPending ? 'Saving...' : 'Save Restrictions'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
