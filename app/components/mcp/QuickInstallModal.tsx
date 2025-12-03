'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Props {
  onClose: () => void;
  onInstall: (serverIds: string[]) => Promise<void>;
}

const QUICK_SETUPS = [
  { id: 'essential', name: 'Essential', servers: ['memory', 'filesystem'] },
  { id: 'dev', name: 'Developer', servers: ['git', 'filesystem', 'recoder-github'] },
  { id: 'research', name: 'Research', servers: ['fetch', 'memory', 'sequential-thinking'] },
];

export function QuickInstallModal({ onClose, onInstall }: Props) {
  const [installing, setInstalling] = useState(false);

  async function handleInstall(servers: string[]) {
    setInstalling(true);
    try {
      await onInstall(servers);
      onClose();
    } catch (error) {
      console.error('Install failed:', error);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Quick Setup</h2>
        <div className="space-y-3">
          {QUICK_SETUPS.map(setup => (
            <Button
              key={setup.id}
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleInstall(setup.servers)}
              disabled={installing}
            >
              <div className="text-left">
                <div className="font-semibold">{setup.name}</div>
                <div className="text-xs text-muted-foreground">
                  {setup.servers.length} servers
                </div>
              </div>
            </Button>
          ))}
        </div>
        <Button variant="ghost" className="w-full mt-4" onClick={onClose}>
          Cancel
        </Button>
      </Card>
    </div>
  );
}
