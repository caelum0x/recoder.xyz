import { json, type MetaFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { ProjectsPage } from '~/components/projects/ProjectsPage.client';
import { Header } from '~/components/header/Header';
import { ProjectsDB, type Project } from '~/lib/.server/db/projects-db';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Projects');

// Remix serializes Date to string via JSON
type SerializedProject = Omit<Project, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

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

    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      logger.warn('DATABASE_URL not available');
      return json({ projects: [], error: null, databaseConfigured: false });
    }

    // If no userId provided, return empty (client will fetch with localStorage userId)
    if (!userId) {
      return json({ projects: [], error: null, databaseConfigured: true });
    }

    const projectsDB = new ProjectsDB(databaseUrl);
    const projects = await projectsDB.getUserProjects(userId);

    return json({ projects, error: null, databaseConfigured: true });
  } catch (error) {
    logger.error('Projects loader error:', error);
    return json({ projects: [], error: 'Failed to load projects', databaseConfigured: true });
  }
}

export default function Projects() {
  const { projects, error, databaseConfigured } = useLoaderData<typeof loader>();

  // Convert serialized projects back to Project type with Date objects
  const projectsWithDates: Project[] = (projects || []).map(p => ({
    ...p,
    createdAt: new Date(p?.createdAt || Date.now()),
    updatedAt: new Date(p?.updatedAt || Date.now()),
  })) as Project[];

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
        {() => <ProjectsPage initialProjects={projectsWithDates} error={error} databaseConfigured={databaseConfigured} />}
      </ClientOnly>
    </div>
  );
}
