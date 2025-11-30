import { useLoaderData } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ request }: LoaderFunctionArgs) {
  const res = await fetch(new URL('/api/community', request.url));
  const data = await res.json();
  return json(data);
}

export default function CommunityPage() {
  const { projects } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-bolt-elements-textPrimary mb-8">
          Community Projects
        </h1>

        {projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🚀</div>
            <h2 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">
              No projects yet
            </h2>
            <p className="text-bolt-elements-textSecondary">
              Be the first to share your project with the community!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project: any) => (
              <div
                key={project.id}
                className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-6 hover:border-bolt-elements-borderColorActive transition-colors"
              >
                <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-2">
                  {project.project_name}
                </h3>
                <p className="text-sm text-bolt-elements-textSecondary mb-4 line-clamp-2">
                  {project.description || 'No description'}
                </p>

                <div className="flex items-center gap-4 text-sm text-bolt-elements-textTertiary mb-4">
                  <span className="flex items-center gap-1">
                    <div className="i-ph:eye" />
                    {project.views}
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="i-ph:heart" />
                    {project.likes}
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="i-ph:git-fork" />
                    {project.forks}
                  </span>
                </div>

                {project.framework && (
                  <div className="inline-flex px-2 py-1 bg-bolt-elements-background-depth-3 rounded text-xs text-bolt-elements-textTertiary">
                    {project.framework}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-bolt-elements-borderColor">
                  <button className="w-full px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover">
                    View Project
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
