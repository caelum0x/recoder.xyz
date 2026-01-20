import { memo, useCallback, useState } from 'react';
import { classNames } from '~/utils/classNames';

interface ReplConfig {
  id: string;
  name: string;
  command: string;
  icon: string;
  iconColor: string;
  description: string;
  detectionFiles?: string[]; // Files that indicate this REPL is available
}

const REPL_CONFIGS: ReplConfig[] = [
  {
    id: 'node',
    name: 'Node.js',
    command: 'node',
    icon: 'i-logos:nodejs-icon',
    iconColor: 'text-green-500',
    description: 'Node.js REPL',
    detectionFiles: ['package.json', 'node_modules'],
  },
  {
    id: 'python',
    name: 'Python',
    command: 'python3',
    icon: 'i-logos:python',
    iconColor: 'text-yellow-500',
    description: 'Python 3 REPL',
    detectionFiles: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
  },
  {
    id: 'rails',
    name: 'Rails',
    command: 'rails c',
    icon: 'i-logos:rails',
    iconColor: 'text-red-500',
    description: 'Rails Console',
    detectionFiles: ['Gemfile', 'config/application.rb'],
  },
  {
    id: 'bun',
    name: 'Bun',
    command: 'bun repl',
    icon: 'i-logos:bun',
    iconColor: 'text-pink-400',
    description: 'Bun REPL',
    detectionFiles: ['bun.lockb', 'bunfig.toml'],
  },
  {
    id: 'deno',
    name: 'Deno',
    command: 'deno',
    icon: 'i-logos:deno',
    iconColor: 'text-white',
    description: 'Deno REPL',
    detectionFiles: ['deno.json', 'deno.jsonc', 'import_map.json'],
  },
  {
    id: 'irb',
    name: 'Ruby',
    command: 'irb',
    icon: 'i-logos:ruby',
    iconColor: 'text-red-600',
    description: 'Interactive Ruby',
    detectionFiles: ['Gemfile', '.ruby-version'],
  },
  {
    id: 'psql',
    name: 'PostgreSQL',
    command: 'psql',
    icon: 'i-logos:postgresql',
    iconColor: 'text-blue-500',
    description: 'PostgreSQL CLI',
    detectionFiles: [],
  },
  {
    id: 'mysql',
    name: 'MySQL',
    command: 'mysql',
    icon: 'i-logos:mysql',
    iconColor: 'text-orange-500',
    description: 'MySQL CLI',
    detectionFiles: [],
  },
];

// Quick commands that aren't REPLs but useful
const QUICK_COMMANDS: ReplConfig[] = [
  {
    id: 'npm-install',
    name: 'npm install',
    command: 'npm install',
    icon: 'i-ph:package',
    iconColor: 'text-red-400',
    description: 'Install npm packages',
    detectionFiles: ['package.json'],
  },
  {
    id: 'npm-dev',
    name: 'npm dev',
    command: 'npm run dev',
    icon: 'i-ph:play',
    iconColor: 'text-green-400',
    description: 'Start development server',
    detectionFiles: ['package.json'],
  },
  {
    id: 'npm-build',
    name: 'npm build',
    command: 'npm run build',
    icon: 'i-ph:hammer',
    iconColor: 'text-blue-400',
    description: 'Build for production',
    detectionFiles: ['package.json'],
  },
  {
    id: 'pip-install',
    name: 'pip install',
    command: 'pip install -r requirements.txt',
    icon: 'i-ph:package',
    iconColor: 'text-yellow-400',
    description: 'Install Python dependencies',
    detectionFiles: ['requirements.txt'],
  },
];

interface ReplLauncherProps {
  onLaunch: (command: string, name: string) => void;
  availableFiles?: Set<string>;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

export const ReplLauncher = memo(({
  onLaunch,
  availableFiles = new Set(),
  isExpanded = false,
  onToggleExpand,
  className,
}: ReplLauncherProps) => {
  const [showQuickCommands, setShowQuickCommands] = useState(false);

  // Filter REPLs based on detected files
  const detectAvailableRepls = useCallback((configs: ReplConfig[]): ReplConfig[] => {
    if (availableFiles.size === 0) {
      // Show common REPLs by default if we don't have file info
      return configs.filter(c => ['node', 'python'].includes(c.id));
    }

    return configs.filter(config => {
      // If no detection files specified, always show
      if (!config.detectionFiles || config.detectionFiles.length === 0) {
        return false; // Hide database CLIs by default unless explicitly detected
      }
      // Check if any detection file exists
      return config.detectionFiles.some(file =>
        Array.from(availableFiles).some(f => f.includes(file))
      );
    });
  }, [availableFiles]);

  const availableRepls = detectAvailableRepls(REPL_CONFIGS);
  const availableQuickCommands = detectAvailableRepls(QUICK_COMMANDS);

  const handleLaunch = useCallback((config: ReplConfig) => {
    onLaunch(config.command, config.name);
  }, [onLaunch]);

  if (!isExpanded) {
    return (
      <button
        onClick={onToggleExpand}
        className={classNames(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
          'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
          'hover:bg-bolt-elements-background-depth-4 hover:text-bolt-elements-textPrimary',
          className
        )}
        title="Quick launch REPLs and commands"
      >
        <div className="i-ph:terminal" />
        REPLs
        <div className="i-ph:caret-down text-[10px]" />
      </button>
    );
  }

  return (
    <div className={classNames(
      'absolute bottom-full left-0 mb-1 z-50',
      'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
      'rounded-lg shadow-lg overflow-hidden min-w-[200px]',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor">
        <span className="text-xs font-medium text-bolt-elements-textPrimary">Quick Launch</span>
        <button
          onClick={onToggleExpand}
          className="p-0.5 hover:bg-bolt-elements-background-depth-3 rounded"
        >
          <div className="i-ph:x text-xs text-bolt-elements-textTertiary" />
        </button>
      </div>

      {/* REPLs Section */}
      <div className="p-2">
        <div className="text-[10px] uppercase tracking-wide text-bolt-elements-textTertiary mb-1.5 px-1">
          REPLs
        </div>
        <div className="grid grid-cols-2 gap-1">
          {availableRepls.length > 0 ? (
            availableRepls.map(config => (
              <button
                key={config.id}
                onClick={() => handleLaunch(config)}
                className={classNames(
                  'flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left',
                  'hover:bg-bolt-elements-background-depth-3'
                )}
                title={config.description}
              >
                <div className={classNames(config.icon, config.iconColor, 'text-sm flex-shrink-0')} />
                <span className="truncate text-bolt-elements-textSecondary">{config.name}</span>
              </button>
            ))
          ) : (
            <span className="col-span-2 text-xs text-bolt-elements-textTertiary px-2 py-1">
              No REPLs detected for this project
            </span>
          )}

          {/* Always show Node and Python as fallback */}
          {availableRepls.length === 0 && (
            <>
              <button
                onClick={() => handleLaunch(REPL_CONFIGS[0])}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-bolt-elements-background-depth-3"
                title="Node.js REPL"
              >
                <div className="i-logos:nodejs-icon text-sm" />
                <span className="text-bolt-elements-textSecondary">Node.js</span>
              </button>
              <button
                onClick={() => handleLaunch(REPL_CONFIGS[1])}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-bolt-elements-background-depth-3"
                title="Python REPL"
              >
                <div className="i-logos:python text-sm" />
                <span className="text-bolt-elements-textSecondary">Python</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quick Commands Section */}
      {availableQuickCommands.length > 0 && (
        <div className="p-2 border-t border-bolt-elements-borderColor">
          <button
            onClick={() => setShowQuickCommands(!showQuickCommands)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-bolt-elements-textTertiary mb-1.5 px-1 w-full"
          >
            Quick Commands
            <div className={classNames(
              'i-ph:caret-down text-[8px] transition-transform',
              { 'rotate-180': showQuickCommands }
            )} />
          </button>

          {showQuickCommands && (
            <div className="space-y-0.5">
              {availableQuickCommands.map(config => (
                <button
                  key={config.id}
                  onClick={() => handleLaunch(config)}
                  className={classNames(
                    'flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors w-full text-left',
                    'hover:bg-bolt-elements-background-depth-3'
                  )}
                  title={config.description}
                >
                  <div className={classNames(config.icon, config.iconColor, 'text-sm flex-shrink-0')} />
                  <span className="truncate text-bolt-elements-textSecondary">{config.name}</span>
                  <code className="ml-auto text-[10px] text-bolt-elements-textTertiary truncate max-w-[80px]">
                    {config.command}
                  </code>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Custom Command */}
      <div className="p-2 border-t border-bolt-elements-borderColor">
        <CustomCommandInput onSubmit={(cmd) => onLaunch(cmd, 'Custom')} />
      </div>
    </div>
  );
});

ReplLauncher.displayName = 'ReplLauncher';

// Custom command input component
const CustomCommandInput = memo(({ onSubmit }: { onSubmit: (command: string) => void }) => {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue('');
    }
  }, [value, onSubmit]);

  return (
    <form onSubmit={handleSubmit} className="flex gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Custom command..."
        className={classNames(
          'flex-1 px-2 py-1 text-xs rounded bg-bolt-elements-background-depth-3',
          'border border-bolt-elements-borderColor text-bolt-elements-textPrimary',
          'placeholder:text-bolt-elements-textTertiary focus:outline-none focus:border-blue-500'
        )}
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className={classNames(
          'px-2 py-1 rounded text-xs transition-colors',
          value.trim()
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary cursor-not-allowed'
        )}
      >
        Run
      </button>
    </form>
  );
});

CustomCommandInput.displayName = 'CustomCommandInput';
