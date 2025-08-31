import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  framework: string;
  category: string;
  features: string[];
  preview: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  tags: string[];
}

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'react-dashboard',
    name: 'Admin Dashboard',
    description: 'Modern admin dashboard with charts, tables, and analytics',
    framework: 'react',
    category: 'business',
    features: ['Charts', 'Tables', 'Authentication', 'Responsive Design'],
    preview: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400',
    difficulty: 'intermediate',
    estimatedTime: '2-3 hours',
    tags: ['dashboard', 'admin', 'charts', 'business']
  },
  {
    id: 'next-ecommerce',
    name: 'E-commerce Store',
    description: 'Full-featured online store with cart, checkout, and payments',
    framework: 'next',
    category: 'ecommerce',
    features: ['Product Catalog', 'Shopping Cart', 'Checkout', 'User Accounts'],
    preview: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400',
    difficulty: 'advanced',
    estimatedTime: '4-6 hours',
    tags: ['ecommerce', 'store', 'payments', 'shopping']
  },
  {
    id: 'react-blog',
    name: 'Personal Blog',
    description: 'Clean and minimal blog with posts, categories, and search',
    framework: 'react',
    category: 'content',
    features: ['Blog Posts', 'Categories', 'Search', 'Comments'],
    preview: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=400',
    difficulty: 'beginner',
    estimatedTime: '1-2 hours',
    tags: ['blog', 'content', 'writing', 'personal']
  },
  {
    id: 'vue-portfolio',
    name: 'Portfolio Website',
    description: 'Professional portfolio showcase for developers and designers',
    framework: 'vue',
    category: 'portfolio',
    features: ['Project Gallery', 'About Section', 'Contact Form', 'Skills'],
    preview: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    difficulty: 'beginner',
    estimatedTime: '1-2 hours',
    tags: ['portfolio', 'showcase', 'professional', 'personal']
  },
  {
    id: 'react-social',
    name: 'Social Media App',
    description: 'Social media platform with posts, likes, comments, and feeds',
    framework: 'react',
    category: 'social',
    features: ['User Profiles', 'Posts', 'Likes', 'Comments', 'Feed'],
    preview: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400',
    difficulty: 'advanced',
    estimatedTime: '5-8 hours',
    tags: ['social', 'media', 'community', 'networking']
  },
  {
    id: 'next-saas',
    name: 'SaaS Landing Page',
    description: 'Convert-optimized landing page for SaaS products',
    framework: 'next',
    category: 'marketing',
    features: ['Hero Section', 'Pricing Tables', 'Testimonials', 'CTA'],
    preview: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400',
    difficulty: 'intermediate',
    estimatedTime: '2-3 hours',
    tags: ['saas', 'landing', 'marketing', 'conversion']
  },
  {
    id: 'react-todo',
    name: 'Task Management',
    description: 'Productive task manager with projects, deadlines, and collaboration',
    framework: 'react',
    category: 'productivity',
    features: ['Tasks', 'Projects', 'Deadlines', 'Collaboration'],
    preview: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400',
    difficulty: 'intermediate',
    estimatedTime: '2-4 hours',
    tags: ['productivity', 'tasks', 'management', 'organization']
  },
  {
    id: 'vue-weather',
    name: 'Weather App',
    description: 'Beautiful weather app with forecasts and location detection',
    framework: 'vue',
    category: 'utility',
    features: ['Current Weather', 'Forecasts', 'Location', 'Maps'],
    preview: 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=400',
    difficulty: 'beginner',
    estimatedTime: '1-2 hours',
    tags: ['weather', 'utility', 'api', 'location']
  },
  {
    id: 'react-fitness',
    name: 'Fitness Tracker',
    description: 'Comprehensive fitness tracking with workouts and progress',
    framework: 'react',
    category: 'health',
    features: ['Workout Tracking', 'Progress Charts', 'Goals', 'Social'],
    preview: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400',
    difficulty: 'intermediate',
    estimatedTime: '3-4 hours',
    tags: ['fitness', 'health', 'tracking', 'wellness']
  },
  {
    id: 'next-docs',
    name: 'Documentation Site',
    description: 'Professional documentation site with search and navigation',
    framework: 'next',
    category: 'documentation',
    features: ['Search', 'Navigation', 'Code Highlighting', 'Responsive'],
    preview: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400',
    difficulty: 'intermediate',
    estimatedTime: '2-3 hours',
    tags: ['documentation', 'docs', 'knowledge', 'reference']
  }
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const framework = searchParams.get('framework');
    const difficulty = searchParams.get('difficulty');
    const search = searchParams.get('search');

    let filteredTemplates = PROJECT_TEMPLATES;

    if (category && category !== 'all') {
      filteredTemplates = filteredTemplates.filter(t => t.category === category);
    }

    if (framework && framework !== 'all') {
      filteredTemplates = filteredTemplates.filter(t => t.framework === framework);
    }

    if (difficulty && difficulty !== 'all') {
      filteredTemplates = filteredTemplates.filter(t => t.difficulty === difficulty);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredTemplates = filteredTemplates.filter(t => 
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    const categories = [...new Set(PROJECT_TEMPLATES.map(t => t.category))];
    const frameworks = [...new Set(PROJECT_TEMPLATES.map(t => t.framework))];
    const difficulties = [...new Set(PROJECT_TEMPLATES.map(t => t.difficulty))];

    return NextResponse.json({
      success: true,
      data: {
        templates: filteredTemplates,
        filters: {
          categories,
          frameworks,
          difficulties
        },
        total: filteredTemplates.length
      }
    });

  } catch (error) {
    logger.error('Error fetching project templates:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch templates'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { templateId, projectName, customizations = {} } = await request.json();

    if (!templateId) {
      return NextResponse.json({
        success: false,
        error: 'Template ID is required'
      }, { status: 400 });
    }

    const template = PROJECT_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return NextResponse.json({
        success: false,
        error: 'Template not found'
      }, { status: 404 });
    }

    logger.info(`Creating project from template: ${template.name}`);

    // Generate project based on template
    const response = await fetch('/api/ai/generate-project-enhanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: template.description,
        name: projectName || template.name,
        description: template.description,
        framework: template.framework,
        features: template.features,
        ...customizations
      })
    });

    const result = await response.json();

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          ...result.data,
          template: template,
          message: `Successfully created ${template.name} project`
        }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to create project from template'
      }, { status: 500 });
    }

  } catch (error) {
    logger.error('Error creating project from template:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create project from template'
    }, { status: 500 });
  }
}
