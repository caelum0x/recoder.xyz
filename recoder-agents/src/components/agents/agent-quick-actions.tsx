'use client';

import { useState } from 'react';
import { Plus, LayoutTemplate, Store, FileJson, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: string;
}

export function AgentQuickActions() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const actions: QuickAction[] = [
    {
      icon: <Plus className="h-4 w-4" />,
      label: 'New Agent',
      onClick: () => {
        // Dispatch custom event to open new agent dialog
        window.dispatchEvent(new CustomEvent('open-new-agent-dialog'));
        setIsOpen(false);
      },
      color: 'bg-primary text-primary-foreground',
    },
    {
      icon: <LayoutTemplate className="h-4 w-4" />,
      label: 'From Template',
      onClick: () => {
        router.push('/agents/templates');
        setIsOpen(false);
      },
      color: 'bg-blue-500 text-white',
    },
    {
      icon: <Store className="h-4 w-4" />,
      label: 'From Marketplace',
      onClick: () => {
        router.push('/marketplace');
        setIsOpen(false);
      },
      color: 'bg-purple-500 text-white',
    },
    {
      icon: <FileJson className="h-4 w-4" />,
      label: 'Import Config',
      onClick: () => {
        window.dispatchEvent(new CustomEvent('open-import-agent-dialog'));
        setIsOpen(false);
      },
      color: 'bg-orange-500 text-white',
    },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-2">
      {/* Speed dial actions */}
      {isOpen && (
        <div className="flex flex-col-reverse gap-2 mb-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              className={cn(
                'flex items-center gap-2 rounded-full pl-3 pr-4 py-2 text-sm font-medium shadow-lg transition-all',
                'animate-in fade-in slide-in-from-bottom-2 duration-200',
                action.color
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Main FAB */}
      <Button
        size="lg"
        className={cn(
          'h-14 w-14 rounded-full shadow-lg transition-transform',
          isOpen && 'rotate-45'
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </Button>
    </div>
  );
}
