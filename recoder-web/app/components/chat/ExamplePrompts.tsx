import { classNames } from '~/utils/classNames';

interface ExamplePromptsProps {
  onSelectPrompt: (prompt: string) => void;
}

const EXAMPLE_PROMPTS = [
  {
    category: 'Full-Stack Applications',
    description: 'Complete apps with backend, database, and API',
    prompts: [
      {
        title: 'Todo App with Backend',
        prompt: 'Build a complete todo application with REST API, SQLite database, user authentication, and a React frontend with Tailwind CSS',
        complexity: 'Advanced',
      },
      {
        title: 'Blog Platform',
        prompt: 'Create a blog platform with authentication, post creation/editing, comments system, SQLite database, and admin panel',
        complexity: 'Advanced',
      },
      {
        title: 'E-commerce Site',
        prompt: 'Build an e-commerce site with product listings, shopping cart, checkout flow, backend API, and SQLite for products and orders',
        complexity: 'Advanced',
      },
    ],
  },
  {
    category: 'Backend & APIs',
    description: 'RESTful APIs, databases, and authentication',
    prompts: [
      {
        title: 'REST API with Auth',
        prompt: 'Create a REST API with Express, TypeScript, JWT authentication, user registration/login, and SQLite database',
        complexity: 'Advanced',
      },
      {
        title: 'Task Manager API',
        prompt: 'Build a task management API with CRUD operations, user authentication, projects, tasks, and SQLite database',
        complexity: 'Advanced',
      },
      {
        title: 'Database Schema',
        prompt: 'Create a database schema for a social media app with users, posts, comments, likes, and followers. Include migrations and seed data',
        complexity: 'Advanced',
      },
    ],
  },
  {
    category: 'Frontend & UI',
    description: 'Beautiful interfaces and components',
    prompts: [
      {
        title: 'Dashboard with Charts',
        prompt: 'Create a responsive analytics dashboard with charts, filters, data tables, and dark mode using React and Tailwind',
        complexity: 'Basic',
      },
      {
        title: 'Landing Page',
        prompt: 'Build a modern landing page with hero section, features, testimonials, pricing, and contact form using Tailwind CSS',
        complexity: 'Basic',
      },
      {
        title: 'Component Library',
        prompt: 'Create a reusable component library with buttons, inputs, modals, dropdowns, and cards using React and Tailwind',
        complexity: 'Basic',
      },
    ],
  },
];

export function ExamplePrompts({ onSelectPrompt }: ExamplePromptsProps) {
  return (
    <div className="w-full max-w-6xl mx-auto mb-12">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-bolt-elements-textPrimary mb-2">
          What would you like to build today?
        </h2>
        <p className="text-bolt-elements-textSecondary">
          From simple UIs to complete full-stack applications with backends and databases
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {EXAMPLE_PROMPTS.map((category) => (
          <div
            key={category.category}
            className="flex flex-col bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor overflow-hidden hover:border-bolt-elements-borderColorActive transition-colors"
          >
            {/* Category Header */}
            <div className="p-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
              <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-1">{category.category}</h3>
              <p className="text-xs text-bolt-elements-textSecondary">{category.description}</p>
            </div>

            {/* Prompts */}
            <div className="flex flex-col gap-2 p-3">
              {category.prompts.map((example, index) => (
                <button
                  key={index}
                  onClick={() => onSelectPrompt(example.prompt)}
                  className={classNames(
                    'group relative flex flex-col items-start gap-2 p-3 rounded-lg',
                    'bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-item-backgroundAccent',
                    'border border-transparent hover:border-bolt-elements-borderColorActive',
                    'transition-all duration-200 text-left',
                  )}
                >
                  {/* Title */}
                  <span className="font-medium text-sm text-bolt-elements-textPrimary group-hover:text-bolt-elements-item-contentAccent">
                    {example.title}
                  </span>

                  {/* Description (truncated) */}
                  <p className="text-xs text-bolt-elements-textSecondary line-clamp-2 group-hover:text-bolt-elements-textPrimary transition-colors">
                    {example.prompt}
                  </p>

                  {/* Complexity Badge */}
                  <div
                    className={classNames(
                      'px-2 py-0.5 rounded-full text-[10px] font-medium',
                      example.complexity === 'Advanced'
                        ? 'bg-accent-500/10 text-accent-600 dark:text-accent-400'
                        : 'bg-green-500/10 text-green-600 dark:text-green-400',
                    )}
                  >
                    {example.complexity}
                  </div>

                  {/* Hover arrow */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="i-ph:arrow-right text-bolt-elements-item-contentAccent text-lg" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tips section */}
      <div className="mt-8 p-4 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor">
        <h4 className="font-semibold text-bolt-elements-textPrimary mb-2">Pro Tips</h4>
        <ul className="text-sm text-bolt-elements-textSecondary space-y-1">
          <li>Be specific: Mention the tech stack, database, and features you want</li>
          <li>Complex projects use advanced models for best quality</li>
          <li>Simple tasks use fast models for quick results</li>
        </ul>
      </div>
    </div>
  );
}

// Simpler inline version for smaller spaces
export function QuickPrompts({ onSelectPrompt }: ExamplePromptsProps) {
  const quickPrompts = [
    'Build a todo app with backend',
    'Create a REST API with authentication',
    'Make a dashboard with charts',
    'Build an e-commerce site',
    'Create a blog platform',
  ];

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {quickPrompts.map((prompt, index) => (
        <button
          key={index}
          onClick={() => onSelectPrompt(prompt)}
          className={classNames(
            'px-4 py-2 rounded-full',
            'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-item-backgroundAccent',
            'border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive',
            'text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            'transition-all duration-200',
          )}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
