import { useState } from 'react';
import { classNames } from '~/utils/classNames';

interface QuickActionsProps {
  onSelectAction: (prompt: string) => void;
  disabled?: boolean;
}

const QUICK_ACTIONS = [
  {
    id: 'database',
    icon: '🗄️',
    label: 'Add Database',
    prompt: 'Add a SQLite database to this project with schema, migrations, and connection setup. Include TypeScript types for the models.',
    description: 'Set up database with schema',
    color: 'from-blue-500 to-blue-600',
  },
  {
    id: 'auth',
    icon: '🔐',
    label: 'Add Auth',
    prompt: 'Implement user authentication with JWT tokens, including registration, login, logout, and password hashing. Add middleware for protected routes.',
    description: 'User authentication system',
    color: 'from-green-500 to-green-600',
  },
  {
    id: 'api',
    icon: '📡',
    label: 'Create API',
    prompt: 'Create a RESTful API endpoint with CRUD operations, input validation, error handling, and proper HTTP status codes. Include TypeScript types.',
    description: 'REST API with CRUD',
    color: 'from-purple-500 to-purple-600',
  },
  {
    id: 'component',
    icon: '🧩',
    label: 'Add Component',
    prompt: 'Create a new React component with TypeScript, props interface, and styling. Make it reusable and well-documented.',
    description: 'React component with props',
    color: 'from-pink-500 to-pink-600',
  },
  {
    id: 'tests',
    icon: '🧪',
    label: 'Add Tests',
    prompt: 'Add unit tests for the main functionality using a testing framework. Include test cases for success and error scenarios.',
    description: 'Unit tests for code',
    color: 'from-orange-500 to-orange-600',
  },
  {
    id: 'deploy',
    icon: '🚀',
    label: 'Deploy Setup',
    prompt: 'Set up deployment configuration for Vercel or Netlify. Include environment variables, build commands, and deployment scripts.',
    description: 'Deployment configuration',
    color: 'from-red-500 to-red-600',
  },
];

export function QuickActions({ onSelectAction, disabled }: QuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  const handleActionClick = (action: typeof QUICK_ACTIONS[0]) => {
    onSelectAction(action.prompt);
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-24 right-8 z-50">
      {/* Action buttons - shown when open */}
      {isOpen && (
        <div className="flex flex-col gap-2 mb-4 animate-fade-in">
          {QUICK_ACTIONS.map((action, index) => (
            <button
              key={action.id}
              onClick={() => handleActionClick(action)}
              onMouseEnter={() => setHoveredAction(action.id)}
              onMouseLeave={() => setHoveredAction(null)}
              disabled={disabled}
              className={classNames(
                'group relative flex items-center gap-3 px-4 py-3 rounded-lg',
                'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
                'border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive',
                'shadow-lg hover:shadow-xl',
                'transition-all duration-200 transform hover:scale-105',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              {/* Icon with gradient background */}
              <div
                className={classNames(
                  'flex items-center justify-center w-10 h-10 rounded-lg',
                  'bg-gradient-to-br text-white text-xl font-semibold',
                  action.color
                )}
              >
                {action.icon}
              </div>

              {/* Label and description */}
              <div className="flex flex-col items-start text-left">
                <span className="font-medium text-sm text-bolt-elements-textPrimary">
                  {action.label}
                </span>
                <span className="text-xs text-bolt-elements-textSecondary">
                  {action.description}
                </span>
              </div>

              {/* Arrow on hover */}
              <div className="ml-auto text-bolt-elements-textTertiary group-hover:text-bolt-elements-textPrimary transition-colors">
                <div className="i-ph:arrow-right text-lg" />
              </div>

              {/* Tooltip on hover */}
              {hoveredAction === action.id && (
                <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-bolt-elements-background-depth-4 rounded-lg border border-bolt-elements-borderColor shadow-xl text-xs text-bolt-elements-textSecondary max-w-xs whitespace-normal z-10">
                  {action.prompt}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Main toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={classNames(
          'flex items-center justify-center w-14 h-14 rounded-full',
          'bg-gradient-to-br from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700',
          'text-white shadow-lg hover:shadow-xl',
          'transition-all duration-200 transform hover:scale-110',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isOpen && 'rotate-45'
        )}
        title="Quick Actions"
      >
        {isOpen ? (
          <div className="i-ph:x text-2xl" />
        ) : (
          <div className="i-ph:lightning-fill text-2xl" />
        )}
      </button>

      {/* Keyboard shortcut hint */}
      {!isOpen && !disabled && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-bolt-elements-background-depth-3 rounded border border-bolt-elements-borderColor text-xs text-bolt-elements-textSecondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Press <kbd className="kdb">Cmd+K</kbd>
        </div>
      )}
    </div>
  );
}

// Inline quick actions for within chat
export function InlineQuickActions({ onSelectAction }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 p-4">
      <div className="w-full text-sm text-bolt-elements-textSecondary mb-2">
        Quick actions:
      </div>
      {QUICK_ACTIONS.slice(0, 4).map((action) => (
        <button
          key={action.id}
          onClick={() => onSelectAction(action.prompt)}
          className={classNames(
            'flex items-center gap-2 px-3 py-2 rounded-lg',
            'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
            'border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive',
            'text-sm transition-all duration-200'
          )}
        >
          <span className="text-lg">{action.icon}</span>
          <span className="text-bolt-elements-textPrimary">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
