import { memo, useCallback } from 'react';
import { classNames } from '~/utils/classNames';

interface QuickCommand {
  id: string;
  label: string;
  command: string;
  icon: string;
  color: string;
  description: string;
}

const QUICK_COMMANDS: QuickCommand[] = [
  {
    id: 'npm-install',
    label: 'Install',
    command: 'npm install',
    icon: 'i-ph:package',
    color: 'text-red-400 hover:bg-red-500/20',
    description: 'npm install - Install dependencies',
  },
  {
    id: 'npm-dev',
    label: 'Dev',
    command: 'npm run dev',
    icon: 'i-ph:play-circle',
    color: 'text-green-400 hover:bg-green-500/20',
    description: 'npm run dev - Start development server',
  },
  {
    id: 'npm-build',
    label: 'Build',
    command: 'npm run build',
    icon: 'i-ph:hammer',
    color: 'text-blue-400 hover:bg-blue-500/20',
    description: 'npm run build - Build for production',
  },
  {
    id: 'npm-test',
    label: 'Test',
    command: 'npm test',
    icon: 'i-ph:test-tube',
    color: 'text-yellow-400 hover:bg-yellow-500/20',
    description: 'npm test - Run tests',
  },
  {
    id: 'git-status',
    label: 'Status',
    command: 'git status',
    icon: 'i-ph:git-branch',
    color: 'text-purple-400 hover:bg-purple-500/20',
    description: 'git status - Check git status',
  },
];

interface QuickCommandsProps {
  onRunCommand: (command: string) => void;
  className?: string;
}

export const QuickCommands = memo(({
  onRunCommand,
  className,
}: QuickCommandsProps) => {
  const handleClick = useCallback((command: string) => {
    onRunCommand(command);
  }, [onRunCommand]);

  return (
    <div className={classNames('flex items-center gap-1', className)}>
      {QUICK_COMMANDS.map((cmd) => (
        <button
          key={cmd.id}
          onClick={() => handleClick(cmd.command)}
          className={classNames(
            'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
            'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
            cmd.color
          )}
          title={cmd.description}
        >
          <div className={classNames(cmd.icon, 'text-sm')} />
          <span className="hidden sm:inline">{cmd.label}</span>
        </button>
      ))}
    </div>
  );
});

QuickCommands.displayName = 'QuickCommands';
