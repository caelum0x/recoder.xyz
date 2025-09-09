'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Clock, 
  MemoryStick, 
  Cpu, 
  Network, 
  HardDrive, 
  AlertTriangle,
  CheckCircle,
  Info,
  Settings
} from 'lucide-react';

interface SandboxSettings {
  timeout: number;
  memory: number;
  cpuLimit: number;
  networkAccess: boolean;
  fileSystemAccess: boolean;
  dockerSecurity: boolean;
}

interface SandboxSettingsProps {
  settings: SandboxSettings;
  onSettingsChange: (settings: SandboxSettings) => void;
  onClose: () => void;
}

export function SandboxSettings({
  settings,
  onSettingsChange,
  onClose
}: SandboxSettingsProps) {
  const updateSettings = (updates: Partial<SandboxSettings>) => {
    onSettingsChange({ ...settings, ...updates });
  };

  const resetToDefaults = () => {
    onSettingsChange({
      timeout: 30,
      memory: 256,
      cpuLimit: 50,
      networkAccess: false,
      fileSystemAccess: false,
      dockerSecurity: true
    });
  };

  const getSecurityLevel = () => {
    const score = [
      settings.dockerSecurity ? 1 : 0,
      !settings.networkAccess ? 1 : 0,
      !settings.fileSystemAccess ? 1 : 0,
      settings.memory <= 512 ? 1 : 0,
      settings.timeout <= 60 ? 1 : 0,
      settings.cpuLimit <= 75 ? 1 : 0
    ].reduce((a, b) => a + b, 0);

    if (score >= 5) return { level: 'High', color: 'text-green-600', icon: CheckCircle };
    if (score >= 3) return { level: 'Medium', color: 'text-yellow-600', icon: AlertTriangle };
    return { level: 'Low', color: 'text-red-600', icon: AlertTriangle };
  };

  const securityInfo = getSecurityLevel();
  const SecurityIcon = securityInfo.icon;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Sandbox Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="resources" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="resources">Resources</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="resources" className="space-y-6">
            {/* Resource Limits */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MemoryStick className="w-5 h-5" />
                  Resource Limits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Execution Timeout */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Execution Timeout
                    </Label>
                    <Badge variant="outline">{settings.timeout}s</Badge>
                  </div>
                  <Slider
                    value={[settings.timeout]}
                    onValueChange={([value]) => updateSettings({ timeout: value })}
                    min={5}
                    max={300}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum time allowed for code execution (5-300 seconds)
                  </p>
                </div>

                {/* Memory Limit */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <MemoryStick className="w-4 h-4" />
                      Memory Limit
                    </Label>
                    <Badge variant="outline">{settings.memory}MB</Badge>
                  </div>
                  <Slider
                    value={[settings.memory]}
                    onValueChange={([value]) => updateSettings({ memory: value })}
                    min={64}
                    max={2048}
                    step={64}
                    className="w-full"
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum memory usage allowed (64MB-2GB)
                  </p>
                </div>

                {/* CPU Limit */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      CPU Limit
                    </Label>
                    <Badge variant="outline">{settings.cpuLimit}%</Badge>
                  </div>
                  <Slider
                    value={[settings.cpuLimit]}
                    onValueChange={([value]) => updateSettings({ cpuLimit: value })}
                    min={10}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum CPU usage allowed (10-100%)
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            {/* Security Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Security Level
                  </span>
                  <div className={`flex items-center gap-2 ${securityInfo.color}`}>
                    <SecurityIcon className="w-5 h-5" />
                    <span className="font-medium">{securityInfo.level}</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Current security configuration provides {securityInfo.level.toLowerCase()} protection against malicious code execution.
                </p>
              </CardContent>
            </Card>

            {/* Security Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Security Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Docker Security */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Docker Security Mode
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Enable strict Docker security policies and isolation
                    </p>
                  </div>
                  <Switch
                    checked={settings.dockerSecurity}
                    onCheckedChange={(checked) => updateSettings({ dockerSecurity: checked })}
                  />
                </div>

                {/* Network Access */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-2">
                      <Network className="w-4 h-4" />
                      Network Access
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Allow code to access external networks and APIs
                    </p>
                  </div>
                  <Switch
                    checked={settings.networkAccess}
                    onCheckedChange={(checked) => updateSettings({ networkAccess: checked })}
                  />
                </div>

                {/* File System Access */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4" />
                      File System Access
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Allow code to read and write files to the local system
                    </p>
                  </div>
                  <Switch
                    checked={settings.fileSystemAccess}
                    onCheckedChange={(checked) => updateSettings({ fileSystemAccess: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Security Warnings */}
            {(!settings.dockerSecurity || settings.networkAccess || settings.fileSystemAccess) && (
              <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                    <AlertTriangle className="w-5 h-5" />
                    Security Warning
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-yellow-700 dark:text-yellow-300">
                    {!settings.dockerSecurity && (
                      <li>• Docker security is disabled - containers may have elevated privileges</li>
                    )}
                    {settings.networkAccess && (
                      <li>• Network access is enabled - code can make external requests</li>
                    )}
                    {settings.fileSystemAccess && (
                      <li>• File system access is enabled - code can read/write local files</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            {/* Preset Configurations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Preset Configurations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start"
                    onClick={() => updateSettings({
                      timeout: 15,
                      memory: 128,
                      cpuLimit: 25,
                      networkAccess: false,
                      fileSystemAccess: false,
                      dockerSecurity: true
                    })}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-green-600" />
                      <span className="font-medium">Maximum Security</span>
                    </div>
                    <p className="text-xs text-muted-foreground text-left">
                      Strict limits, no network/file access, Docker security enabled
                    </p>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start"
                    onClick={() => updateSettings({
                      timeout: 60,
                      memory: 512,
                      cpuLimit: 50,
                      networkAccess: true,
                      fileSystemAccess: false,
                      dockerSecurity: true
                    })}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                      <span className="font-medium">Balanced</span>
                    </div>
                    <p className="text-xs text-muted-foreground text-left">
                      Moderate limits, network access allowed, secure file system
                    </p>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start"
                    onClick={() => updateSettings({
                      timeout: 300,
                      memory: 1024,
                      cpuLimit: 100,
                      networkAccess: true,
                      fileSystemAccess: true,
                      dockerSecurity: false
                    })}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="w-4 h-4 text-blue-600" />
                      <span className="font-medium">Performance</span>
                    </div>
                    <p className="text-xs text-muted-foreground text-left">
                      High limits, full access, optimized for performance
                    </p>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    <strong>Docker Security:</strong> Enables strict security policies including no-new-privileges, 
                    read-only root filesystem, and restricted capabilities.
                  </p>
                  <p>
                    <strong>Network Access:</strong> When disabled, code runs in an isolated network environment 
                    without internet access.
                  </p>
                  <p>
                    <strong>File System Access:</strong> Controls whether code can read from and write to the 
                    container's file system.
                  </p>
                  <p>
                    <strong>Resource Limits:</strong> All limits are enforced at the container level to prevent 
                    resource exhaustion attacks.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onClose}>
              Apply Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
