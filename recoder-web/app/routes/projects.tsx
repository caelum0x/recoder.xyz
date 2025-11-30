import { json, type MetaFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { ProjectsPage } from '~/components/projects/ProjectsPage.client';
import { Header } from '~/components/header/Header';
import { ProjectsDB, type Project } from '~/lib/.server/db/projects-db';

export const meta: MetaFunction = () => {
  return [
    { title: 'Projects - Recoder.xyz' },
    { name: 'description', content: 'Manage your AI development projects' }
  ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const anonymousId = url.searchParams.get('anonymousId');

    // Use environment variable check to prevent build errors
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not available, returning mock data');
      return json({ projects: [], error: 'Database not configured' });
    }

    const projectsDB = new ProjectsDB();
    const projects = await projectsDB.getUserProjects(userId || undefined, anonymousId || undefined);

    return json({ projects, error: null });
  } catch (error) {
    console.error('Projects loader error:', error);
    return json({ projects: [], error: 'Failed to load projects' });
  }
}

export default function Projects() {
  const { projects, error } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <Header />
      <ClientOnly fallback={
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-bolt-elements-textPrimary mb-8">Projects</h1>
            <div className="text-bolt-elements-textSecondary">Loading projects...</div>
          </div>
        </div>
      }>
        {() => <ProjectsPage initialProjects={projects} error={error} />}
      </ClientOnly>
    </div>
  );
}
