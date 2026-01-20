import { useState } from 'react';
import { classNames } from '~/utils/classNames';

interface QuickActionsProps {
  onSelectAction: (prompt: string) => void;
  disabled?: boolean;
  onCloneWebsite?: () => void;
  onImportGitHub?: () => void;
  onDeploy?: () => void;
}

type ActionType = 'prompt' | 'clone' | 'github' | 'deploy';

interface QuickAction {
  id: string;
  iconClass: string;
  label: string;
  prompt?: string;
  description: string;
  color: string;
  actionType: ActionType;
}

const QUICK_ACTIONS: QuickAction[] = [
  // Modal-based actions (most impactful - show first)
  {
    id: 'clone-website',
    iconClass: 'i-ph:globe',
    label: 'Clone Website',
    description: 'Clone any website instantly',
    color: 'from-purple-500 to-purple-600',
    actionType: 'clone',
  },
  {
    id: 'import-github',
    iconClass: 'i-ph:github-logo',
    label: 'Import Repo',
    description: 'Import from GitHub',
    color: 'from-gray-700 to-gray-800',
    actionType: 'github',
  },
  {
    id: 'deploy-project',
    iconClass: 'i-ph:rocket-launch',
    label: 'Deploy',
    description: 'Deploy to Vercel/Netlify',
    color: 'from-green-500 to-green-600',
    actionType: 'deploy',
  },
  // Prompt-based actions
  {
    id: 'database',
    iconClass: 'i-ph:database',
    label: 'Add Database',
    prompt: 'Add a SQLite database to this project with schema, migrations, and connection setup. Include TypeScript types for the models.',
    description: 'Set up database with schema',
    color: 'from-blue-500 to-blue-600',
    actionType: 'prompt',
  },
  {
    id: 'auth',
    iconClass: 'i-ph:lock-key',
    label: 'Add Auth',
    prompt: 'Implement user authentication with JWT tokens, including registration, login, logout, and password hashing. Add middleware for protected routes.',
    description: 'User authentication system',
    color: 'from-teal-500 to-teal-600',
    actionType: 'prompt',
  },
  {
    id: 'api',
    iconClass: 'i-ph:plugs-connected',
    label: 'Create API',
    prompt: 'Create a RESTful API endpoint with CRUD operations, input validation, error handling, and proper HTTP status codes. Include TypeScript types.',
    description: 'REST API with CRUD',
    color: 'from-indigo-500 to-indigo-600',
    actionType: 'prompt',
  },
  {
    id: 'component',
    iconClass: 'i-ph:puzzle-piece',
    label: 'Add Component',
    prompt: 'Create a new React component with TypeScript, props interface, and styling. Make it reusable and well-documented.',
    description: 'React component with props',
    color: 'from-pink-500 to-pink-600',
    actionType: 'prompt',
  },
  {
    id: 'tests',
    iconClass: 'i-ph:test-tube',
    label: 'Add Tests',
    prompt: 'Add unit tests for the main functionality using a testing framework. Include test cases for success and error scenarios.',
    description: 'Unit tests for code',
    color: 'from-orange-500 to-orange-600',
    actionType: 'prompt',
  },
  {
    id: 'refactor',
    iconClass: 'i-ph:wrench',
    label: 'Improve Code',
    prompt: `Analyze the currently open file for code improvements.

First, use the readFile tool to read the current file, then:
1. Identify areas for improvement (readability, maintainability, best practices)
2. For each issue, show the BEFORE code with line numbers
3. Explain WHY it should change
4. Show the AFTER code
5. Rate impact: [LOW/MEDIUM/HIGH]

Focus on actionable changes that provide real value. Don't suggest trivial changes.
After analysis, ask if I want to apply any changes using str_replace or multi_apply_diff tools.`,
    description: 'AI-powered refactoring',
    color: 'from-cyan-500 to-cyan-600',
    actionType: 'prompt',
  },
];

export function QuickActions({ onSelectAction, disabled, onCloneWebsite, onImportGitHub, onDeploy }: QuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  const handleActionClick = (action: QuickAction) => {
    switch (action.actionType) {
      case 'clone':
        onCloneWebsite?.();
        break;
      case 'github':
        onImportGitHub?.();
        break;
      case 'deploy':
        onDeploy?.();
        break;
      case 'prompt':
      default:
        if (action.prompt) {
          onSelectAction(action.prompt);
        }
        break;
    }
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
                  'bg-gradient-to-br text-white',
                  action.color
                )}
              >
                <div className={classNames(action.iconClass, 'text-xl')} />
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

              {/* Tooltip on hover - only show for prompt actions */}
              {hoveredAction === action.id && action.prompt && (
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
          isOpen ? 'rotate-45' : ''
        )}
        title="Quick Actions"
      >
        {isOpen ? (
          <div className="i-ph:x text-2xl" />
        ) : (
          <div className="i-ph:lightning-fill text-2xl" />
        )}
      </button>
    </div>
  );
}

// Inline quick actions for within chat - only shows prompt-based actions
export function InlineQuickActions({ onSelectAction }: Pick<QuickActionsProps, 'onSelectAction'>) {
  // Filter to only show prompt-based actions for inline display
  const promptActions = QUICK_ACTIONS.filter(action => action.actionType === 'prompt' && action.prompt);

  return (
    <div className="flex flex-wrap gap-2 p-4">
      <div className="w-full text-sm text-bolt-elements-textSecondary mb-2">
        Quick actions:
      </div>
      {promptActions.slice(0, 4).map((action) => (
        <button
          key={action.id}
          onClick={() => action.prompt && onSelectAction(action.prompt)}
          className={classNames(
            'flex items-center gap-2 px-3 py-2 rounded-lg',
            'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
            'border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive',
            'text-sm transition-all duration-200'
          )}
        >
          <div className={classNames(action.iconClass, 'text-lg')} />
          <span className="text-bolt-elements-textPrimary">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
