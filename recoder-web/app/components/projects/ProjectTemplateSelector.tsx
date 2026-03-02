import React, { useState, useMemo } from 'react';

// Template category types
type TemplateCategory = 'all' | 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'other';

// Template definition
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: string;
  technologies: string[];
  features: string[];
  starterPath?: string; // Path to starter template if available
  previewImage?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isPopular?: boolean;
}

// Available templates based on starters directory
const PROJECT_TEMPLATES: ProjectTemplate[] = [
  // Blank Project
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from scratch with an empty project. Perfect for when you have a specific vision in mind.',
    category: 'other',
    icon: 'i-ph:file-plus',
    technologies: [],
    features: ['Empty canvas', 'Full flexibility', 'No dependencies'],
    difficulty: 'beginner',
  },
  // Frontend Templates
  {
    id: 'vite-react-ts',
    name: 'React + TypeScript',
    description: 'Modern React application with TypeScript, Vite, and Tailwind CSS. Fast development with hot module replacement.',
    category: 'frontend',
    icon: 'i-ph:atom',
    technologies: ['React', 'TypeScript', 'Vite', 'Tailwind CSS'],
    features: ['Hot Module Replacement', 'TypeScript Support', 'ESLint configured', 'Tailwind CSS'],
    starterPath: 'recoder-vite-react-ts',
    difficulty: 'beginner',
    isPopular: true,
  },
  {
    id: 'vite-shadcn',
    name: 'React + shadcn/ui',
    description: 'React app with shadcn/ui components, Radix UI primitives, and Tailwind. Beautiful, accessible components.',
    category: 'frontend',
    icon: 'i-ph:paint-brush',
    technologies: ['React', 'TypeScript', 'shadcn/ui', 'Radix UI', 'Tailwind CSS'],
    features: ['Pre-built UI Components', 'Dark Mode', 'Accessible', 'Customizable'],
    starterPath: 'vite-shadcn',
    difficulty: 'beginner',
    isPopular: true,
  },
  {
    id: 'react',
    name: 'React (JavaScript)',
    description: 'Simple React setup with JavaScript. Great for quick prototypes and learning.',
    category: 'frontend',
    icon: 'i-ph:atom',
    technologies: ['React', 'JavaScript', 'Vite'],
    features: ['Lightweight', 'Quick setup', 'No TypeScript'],
    starterPath: 'react',
    difficulty: 'beginner',
  },
  {
    id: 'react-ts',
    name: 'React + TypeScript (Minimal)',
    description: 'Minimal React TypeScript setup without additional styling frameworks.',
    category: 'frontend',
    icon: 'i-ph:atom',
    technologies: ['React', 'TypeScript', 'Vite'],
    features: ['TypeScript', 'Minimal setup', 'No styling framework'],
    starterPath: 'react-ts',
    difficulty: 'beginner',
  },
  {
    id: 'vue',
    name: 'Vue.js',
    description: 'Progressive JavaScript framework for building user interfaces. Easy to learn and highly adaptable.',
    category: 'frontend',
    icon: 'i-ph:code',
    technologies: ['Vue 3', 'JavaScript', 'Vite'],
    features: ['Composition API', 'Reactive', 'Component-based'],
    starterPath: 'vue',
    difficulty: 'beginner',
  },
  {
    id: 'angular',
    name: 'Angular',
    description: 'Full-featured framework by Google for building scalable web applications.',
    category: 'frontend',
    icon: 'i-ph:shield-check',
    technologies: ['Angular', 'TypeScript', 'RxJS'],
    features: ['Full framework', 'CLI tools', 'Dependency injection'],
    starterPath: 'angular',
    difficulty: 'intermediate',
  },
  {
    id: 'svelte',
    name: 'SvelteKit',
    description: 'Modern framework for building high-performance web apps with Svelte.',
    category: 'frontend',
    icon: 'i-ph:flame',
    technologies: ['Svelte', 'SvelteKit', 'TypeScript'],
    features: ['No virtual DOM', 'Server-side rendering', 'File-based routing'],
    starterPath: 'sveltekit',
    difficulty: 'intermediate',
  },
  {
    id: 'quasar',
    name: 'Quasar Framework',
    description: 'Vue-based framework for building responsive websites, mobile apps, and Electron apps.',
    category: 'frontend',
    icon: 'i-ph:layout',
    technologies: ['Vue 3', 'Quasar', 'TypeScript'],
    features: ['Material Design', 'Cross-platform', 'Rich components'],
    starterPath: 'quasar',
    difficulty: 'intermediate',
  },
  {
    id: 'astro-shadcn',
    name: 'Astro + shadcn',
    description: 'Content-focused static site builder with shadcn/ui components.',
    category: 'frontend',
    icon: 'i-ph:rocket',
    technologies: ['Astro', 'React', 'shadcn/ui', 'Tailwind CSS'],
    features: ['Zero JS by default', 'Island architecture', 'SEO optimized'],
    starterPath: 'astro-shadcn',
    difficulty: 'intermediate',
  },
  {
    id: 'gsap-react',
    name: 'React + GSAP',
    description: 'React application with GSAP animation library for stunning animations.',
    category: 'frontend',
    icon: 'i-ph:magic-wand',
    technologies: ['React', 'GSAP', 'JavaScript'],
    features: ['Professional animations', 'Timeline control', 'ScrollTrigger'],
    starterPath: 'gsap-react',
    difficulty: 'intermediate',
  },
  // Full Stack Templates
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'Full-stack React framework with server-side rendering, API routes, and static generation.',
    category: 'fullstack',
    icon: 'i-ph:stack',
    technologies: ['Next.js', 'React', 'TypeScript'],
    features: ['Server-side rendering', 'API routes', 'File-based routing', 'Static generation'],
    starterPath: 'nextjs',
    difficulty: 'intermediate',
    isPopular: true,
  },
  {
    id: 'nextjs-shadcn',
    name: 'Next.js + shadcn/ui',
    description: 'Next.js with shadcn/ui components. Production-ready full-stack setup.',
    category: 'fullstack',
    icon: 'i-ph:stack',
    technologies: ['Next.js', 'React', 'TypeScript', 'shadcn/ui', 'Tailwind CSS'],
    features: ['Full component library', 'Dark mode', 'SSR', 'API routes'],
    starterPath: 'nextjs-shadcn',
    difficulty: 'intermediate',
    isPopular: true,
  },
  {
    id: 'nextjs-ecommerce',
    name: 'Next.js E-commerce',
    description: 'E-commerce starter with Stripe integration for building online stores.',
    category: 'fullstack',
    icon: 'i-ph:shopping-cart',
    technologies: ['Next.js', 'React', 'Stripe', 'TypeScript'],
    features: ['Stripe payments', 'Product catalog', 'Shopping cart', 'Checkout flow'],
    starterPath: 'nextjs-ecommerce-stripe',
    difficulty: 'advanced',
  },
  {
    id: 'nextjs-blog',
    name: 'Next.js Blog',
    description: 'Blog starter with MDX support for writing content in Markdown.',
    category: 'fullstack',
    icon: 'i-ph:article',
    technologies: ['Next.js', 'MDX', 'React', 'TypeScript'],
    features: ['MDX support', 'Blog posts', 'SEO optimized', 'RSS feed'],
    starterPath: 'nextjs-blog-mdx',
    difficulty: 'intermediate',
  },
  {
    id: 'qwik',
    name: 'Qwik',
    description: 'Resumable framework for instant-loading web applications.',
    category: 'fullstack',
    icon: 'i-ph:lightning',
    technologies: ['Qwik', 'TypeScript'],
    features: ['Resumability', 'Zero hydration', 'Instant loading'],
    starterPath: 'recoder-qwik',
    difficulty: 'advanced',
  },
  // Backend Templates
  {
    id: 'express-ts',
    name: 'Express + TypeScript',
    description: 'Production-ready Express.js API with TypeScript, validation, and OpenAPI docs.',
    category: 'backend',
    icon: 'i-ph:lightning',
    technologies: ['Express', 'TypeScript', 'Zod', 'Swagger'],
    features: ['OpenAPI documentation', 'Input validation', 'Rate limiting', 'Security headers'],
    starterPath: 'express-typescript',
    difficulty: 'intermediate',
    isPopular: true,
  },
  {
    id: 'express-simple',
    name: 'Express.js (Simple)',
    description: 'Minimal Express.js setup for quick API development.',
    category: 'backend',
    icon: 'i-ph:lightning',
    technologies: ['Express', 'JavaScript', 'Node.js'],
    features: ['Minimal setup', 'Quick start', 'No TypeScript'],
    starterPath: 'express-simple',
    difficulty: 'beginner',
  },
  {
    id: 'express-mongodb',
    name: 'Express + MongoDB',
    description: 'Express.js API with MongoDB database integration.',
    category: 'backend',
    icon: 'i-ph:database',
    technologies: ['Express', 'MongoDB', 'Mongoose', 'TypeScript'],
    features: ['MongoDB integration', 'Mongoose ODM', 'CRUD operations'],
    starterPath: 'express-mongodb-api',
    difficulty: 'intermediate',
  },
  {
    id: 'express-auth',
    name: 'Express + Auth',
    description: 'Express.js API with authentication and authorization setup.',
    category: 'backend',
    icon: 'i-ph:lock',
    technologies: ['Express', 'TypeScript', 'JWT', 'bcrypt'],
    features: ['JWT authentication', 'Password hashing', 'Protected routes', 'User management'],
    starterPath: 'express-typescript-auth',
    difficulty: 'intermediate',
  },
  {
    id: 'hono',
    name: 'Hono',
    description: 'Ultrafast web framework for the Edges. Works on any JavaScript runtime.',
    category: 'backend',
    icon: 'i-ph:flame',
    technologies: ['Hono', 'TypeScript', 'Node.js'],
    features: ['Ultrafast', 'Edge compatible', 'Middleware support', 'TypeScript native'],
    starterPath: 'hono-nodejs-starter',
    difficulty: 'intermediate',
  },
  {
    id: 'graphql',
    name: 'GraphQL Server',
    description: 'GraphQL API server for flexible data querying.',
    category: 'backend',
    icon: 'i-ph:graph',
    technologies: ['GraphQL', 'Node.js'],
    features: ['GraphQL queries', 'Type system', 'Introspection'],
    starterPath: 'graphql',
    difficulty: 'intermediate',
  },
  {
    id: 'json-server',
    name: 'JSON Server',
    description: 'Fake REST API with zero coding in 30 seconds. Great for prototyping.',
    category: 'backend',
    icon: 'i-ph:file-json',
    technologies: ['JSON Server', 'Node.js'],
    features: ['Zero configuration', 'Fake REST API', 'Prototyping'],
    starterPath: 'json-server',
    difficulty: 'beginner',
  },
  // Mobile Templates
  {
    id: 'expo',
    name: 'Expo (React Native)',
    description: 'React Native with Expo for building mobile apps for iOS and Android.',
    category: 'mobile',
    icon: 'i-ph:device-mobile',
    technologies: ['React Native', 'Expo', 'TypeScript'],
    features: ['Cross-platform', 'OTA updates', 'Native APIs', 'Easy testing'],
    starterPath: 'recoder-expo',
    difficulty: 'intermediate',
  },
  // Other Templates
  {
    id: 'slidev',
    name: 'Slidev',
    description: 'Presentation slides for developers, powered by Vue and Markdown.',
    category: 'other',
    icon: 'i-ph:presentation',
    technologies: ['Vue', 'Markdown', 'Slidev'],
    features: ['Markdown-based', 'Code highlighting', 'Live coding', 'Export to PDF'],
    starterPath: 'slidev',
    difficulty: 'beginner',
  },
  {
    id: 'remotion',
    name: 'Remotion',
    description: 'Create videos programmatically with React.',
    category: 'other',
    icon: 'i-ph:video',
    technologies: ['React', 'Remotion', 'TypeScript'],
    features: ['Programmatic videos', 'React components', 'Export to MP4'],
    starterPath: 'recoder-remotion',
    difficulty: 'advanced',
  },
  {
    id: 'tutorialkit',
    name: 'TutorialKit',
    description: 'Create interactive tutorials for teaching web development.',
    category: 'other',
    icon: 'i-ph:graduation-cap',
    technologies: ['Astro', 'TutorialKit'],
    features: ['Interactive tutorials', 'Code editor', 'Step-by-step guides'],
    starterPath: 'tutorialkit',
    difficulty: 'intermediate',
  },
  {
    id: 'static',
    name: 'Static HTML/CSS/JS',
    description: 'Classic static website with HTML, CSS, and JavaScript. No build tools needed.',
    category: 'other',
    icon: 'i-ph:code',
    technologies: ['HTML', 'CSS', 'JavaScript'],
    features: ['No build tools', 'Simple deployment', 'Browser-native'],
    starterPath: 'static',
    difficulty: 'beginner',
  },
  {
    id: 'bootstrap',
    name: 'Bootstrap 5',
    description: 'Static site with Bootstrap 5 for responsive design.',
    category: 'other',
    icon: 'i-ph:layout',
    technologies: ['HTML', 'CSS', 'Bootstrap 5', 'JavaScript'],
    features: ['Responsive grid', 'UI components', 'Utilities'],
    starterPath: 'bootstrap-5',
    difficulty: 'beginner',
  },
];

// Category definitions
const CATEGORIES: { id: TemplateCategory; name: string; icon: string }[] = [
  { id: 'all', name: 'All Templates', icon: 'i-ph:squares-four' },
  { id: 'frontend', name: 'Frontend', icon: 'i-ph:browser' },
  { id: 'backend', name: 'Backend', icon: 'i-ph:server' },
  { id: 'fullstack', name: 'Full Stack', icon: 'i-ph:stack' },
  { id: 'mobile', name: 'Mobile', icon: 'i-ph:device-mobile' },
  { id: 'other', name: 'Other', icon: 'i-ph:dots-three' },
];

interface ProjectTemplateSelectorProps {
  onSelect: (template: ProjectTemplate | null) => void;
  selectedTemplate: ProjectTemplate | null;
  className?: string;
}

export function ProjectTemplateSelector({
  onSelect,
  selectedTemplate,
  className = '',
}: ProjectTemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('all');
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  // Filter templates based on search and category
  const filteredTemplates = useMemo(() => {
    return PROJECT_TEMPLATES.filter((template) => {
      // Category filter
      if (selectedCategory !== 'all' && template.category !== selectedCategory) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          template.technologies.some((tech) => tech.toLowerCase().includes(query))
        );
      }

      return true;
    });
  }, [searchQuery, selectedCategory]);

  // Popular templates (show first when no filters)
  const popularTemplates = useMemo(() => {
    return PROJECT_TEMPLATES.filter((t) => t.isPopular);
  }, []);

  const handleTemplateClick = (template: ProjectTemplate) => {
    if (selectedTemplate?.id === template.id) {
      // Deselect if already selected
      onSelect(null);
    } else {
      onSelect(template);
    }
  };

  const toggleExpanded = (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTemplateId(expandedTemplateId === templateId ? null : templateId);
  };

  const getDifficultyColor = (difficulty: ProjectTemplate['difficulty']) => {
    switch (difficulty) {
      case 'beginner':
        return 'text-green-400 bg-green-400/10';
      case 'intermediate':
        return 'text-yellow-400 bg-yellow-400/10';
      case 'advanced':
        return 'text-red-400 bg-red-400/10';
    }
  };

  return (
    <div className={`${className}`}>
      {/* Search and Category Filter */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <div className="i-ph:magnifying-glass text-recoder-elements-textSecondary" />
          </div>
          <input
            type="text"
            placeholder="Search templates by name or technology..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary placeholder-recoder-elements-textSecondary focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary"
            >
              <div className="i-ph:x" />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                selectedCategory === category.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3'
              }`}
            >
              <div className={category.icon} />
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Popular Templates Section (only show when no filters) */}
      {!searchQuery && selectedCategory === 'all' && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-recoder-elements-textSecondary mb-3 flex items-center gap-2">
            <div className="i-ph:star-fill text-orange-400" />
            Popular Templates
          </h3>
          <div className="flex flex-wrap gap-2">
            {popularTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => handleTemplateClick(template)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
                  selectedTemplate?.id === template.id
                    ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                    : 'bg-recoder-elements-background-depth-2 border-recoder-elements-borderColor text-recoder-elements-textPrimary hover:border-orange-500/50'
                }`}
              >
                <div className={template.icon} />
                {template.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Count */}
      {(searchQuery || selectedCategory !== 'all') && (
        <div className="mb-4 text-sm text-recoder-elements-textSecondary">
          Found {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      )}

      {/* Templates Grid */}
      {filteredTemplates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[50vh] overflow-y-auto pr-2">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => handleTemplateClick(template)}
              className={`relative p-4 rounded-lg border cursor-pointer transition-all group ${
                selectedTemplate?.id === template.id
                  ? 'bg-orange-500/10 border-orange-500'
                  : 'bg-recoder-elements-background-depth-2 border-recoder-elements-borderColor hover:border-orange-500/50 hover:bg-recoder-elements-background-depth-3'
              }`}
            >
              {/* Selection indicator */}
              {selectedTemplate?.id === template.id && (
                <div className="absolute top-3 right-3 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                  <div className="i-ph:check text-white text-sm" />
                </div>
              )}

              {/* Popular badge */}
              {template.isPopular && (
                <div className="absolute top-3 right-3 px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded">
                  Popular
                </div>
              )}

              {/* Template Icon and Name */}
              <div className="flex items-start gap-3 mb-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    template.id === 'blank'
                      ? 'bg-recoder-elements-background-depth-1 border-2 border-dashed border-recoder-elements-borderColor'
                      : 'bg-gradient-to-br from-orange-500/20 to-orange-600/20'
                  }`}
                >
                  <div className={`${template.icon} text-xl ${template.id === 'blank' ? 'text-recoder-elements-textSecondary' : 'text-orange-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-recoder-elements-textPrimary truncate">{template.name}</h3>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded mt-1 ${getDifficultyColor(template.difficulty)}`}>
                    {template.difficulty}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-recoder-elements-textSecondary mb-3 line-clamp-2">
                {template.description}
              </p>

              {/* Technologies */}
              {template.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {template.technologies.slice(0, 4).map((tech) => (
                    <span
                      key={tech}
                      className="px-2 py-0.5 bg-recoder-elements-background-depth-1 text-recoder-elements-textSecondary text-xs rounded"
                    >
                      {tech}
                    </span>
                  ))}
                  {template.technologies.length > 4 && (
                    <span className="px-2 py-0.5 text-recoder-elements-textSecondary text-xs">
                      +{template.technologies.length - 4} more
                    </span>
                  )}
                </div>
              )}

              {/* Expand/Collapse for Features */}
              <button
                onClick={(e) => toggleExpanded(template.id, e)}
                className="flex items-center gap-1 text-xs text-recoder-elements-textSecondary hover:text-orange-400 transition-colors"
              >
                <div className={`i-ph:caret-${expandedTemplateId === template.id ? 'up' : 'down'}`} />
                {expandedTemplateId === template.id ? 'Hide features' : 'Show features'}
              </button>

              {/* Expanded Features */}
              {expandedTemplateId === template.id && (
                <div className="mt-3 pt-3 border-t border-recoder-elements-borderColor">
                  <h4 className="text-xs font-medium text-recoder-elements-textSecondary mb-2">Features:</h4>
                  <ul className="space-y-1">
                    {template.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-xs text-recoder-elements-textPrimary">
                        <div className="i-ph:check-circle text-green-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="i-ph:folder-open text-4xl text-recoder-elements-textSecondary mb-4 mx-auto" />
          <h3 className="text-lg font-medium text-recoder-elements-textPrimary mb-2">No templates found</h3>
          <p className="text-recoder-elements-textSecondary">
            Try adjusting your search or category filter
          </p>
        </div>
      )}

      {/* Selected Template Summary */}
      {selectedTemplate && (
        <div className="mt-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <div className={`${selectedTemplate.icon} text-2xl text-orange-400`} />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-recoder-elements-textPrimary">
                Selected: {selectedTemplate.name}
              </h3>
              <p className="text-sm text-recoder-elements-textSecondary">
                {selectedTemplate.technologies.join(' + ') || 'Empty project'}
              </p>
            </div>
            <button
              onClick={() => onSelect(null)}
              className="p-2 text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary transition-colors"
              title="Clear selection"
            >
              <div className="i-ph:x" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export the templates list for use elsewhere
export { PROJECT_TEMPLATES, CATEGORIES };
export type { TemplateCategory };
