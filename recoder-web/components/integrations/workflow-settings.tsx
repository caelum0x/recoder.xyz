'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Save } from 'lucide-react';

interface WorkflowSettingsProps {
  workflowId?: string;
  onSave?: (settings: any) => void;
}

export function WorkflowSettings({ workflowId, onSave }: WorkflowSettingsProps) {
  const [settings, setSettings] = React.useState({
    name: '',
    description: '',
    autoRun: false,
    retryAttempts: 3,
    timeout: 30000
  });

  const handleSave = () => {
    onSave?.(settings);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Workflow Settings</h3>
      </div>
      
      <div className="space-y-4">
        <div>
          <Label htmlFor="workflow-name">Name</Label>
          <Input
            id="workflow-name"
            value={settings.name}
            onChange={(e) => setSettings(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter workflow name"
          />
        </div>
        
        <div>
          <Label htmlFor="workflow-description">Description</Label>
          <Input
            id="workflow-description"
            value={settings.description}
            onChange={(e) => setSettings(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Enter workflow description"
          />
        </div>
        
        <Button onClick={handleSave} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>
    </Card>
  );
}
