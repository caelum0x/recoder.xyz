import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';

const DEFAULT_TEMPLATES = [
  {
    id: 'ecommerce',
    name: 'E-commerce Store',
    description: 'Full-featured online store with cart and checkout',
    category: 'E-commerce',
    tags: 'react,nextjs,stripe,tailwind',
    featured: 1,
  },
  {
    id: 'saas-dashboard',
    name: 'SaaS Dashboard',
    description: 'Modern dashboard with analytics and user management',
    category: 'Dashboard',
    tags: 'react,nextjs,charts,auth',
    featured: 1,
  },
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'Beautiful landing page with hero and features',
    category: 'Marketing',
    tags: 'react,nextjs,tailwind,responsive',
    featured: 1,
  },
  {
    id: 'blog',
    name: 'Blog',
    description: 'Clean blog with markdown support',
    category: 'Content',
    tags: 'react,nextjs,markdown,seo',
    featured: 0,
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Personal portfolio with projects showcase',
    category: 'Personal',
    tags: 'react,nextjs,tailwind,animations',
    featured: 0,
  },
  {
    id: 'admin-panel',
    name: 'Admin Panel',
    description: 'Complete admin panel with CRUD operations',
    category: 'Dashboard',
    tags: 'react,nextjs,tables,forms',
    featured: 0,
  },
  {
    id: 'chat-app',
    name: 'Chat App',
    description: 'Real-time chat with WebSocket support',
    category: 'Social',
    tags: 'react,nextjs,websocket,realtime',
    featured: 1,
  },
  {
    id: 'todo-app',
    name: 'Todo App',
    description: 'Simple todo app with local storage',
    category: 'Productivity',
    tags: 'react,nextjs,localstorage',
    featured: 0,
  },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { cloudflare } = context;
  const db = cloudflare.env.DB;
  const url = new URL(request.url);
  const category = url.searchParams.get('category');

  try {
    let templates = await db.prepare('SELECT * FROM templates ORDER BY featured DESC, usage_count DESC').all();

    if (!templates.results || templates.results.length === 0) {
      // Seed default templates
      for (const template of DEFAULT_TEMPLATES) {
        await db
          .prepare(
            'INSERT INTO templates (id, name, description, category, tags, featured, usage_count) VALUES (?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            template.id,
            template.name,
            template.description,
            template.category,
            template.tags,
            template.featured,
            0
          )
          .run();
      }
      templates = await db.prepare('SELECT * FROM templates ORDER BY featured DESC').all();
    }

    let results = templates.results;
    if (category) {
      results = results.filter((t: any) => t.category === category);
    }

    return json({ templates: results });
  } catch (error) {
    return json({ templates: DEFAULT_TEMPLATES });
  }
}
