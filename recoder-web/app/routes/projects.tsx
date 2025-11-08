/**
 * My Projects Page (web.recoder.xyz)
 * Shows user's projects from web.recoder.xyz
 * Enables Web ↔ CLI workflow
 */

import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData, Link } from '@remix-run/react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { createChatHistoryDB } from '~/lib/.server/db/chat-history-db';
import { verifySession } from '~/lib/auth/session.server';

export const meta: MetaFunction = () => {
  return [
    { title: 'My Projects - Recoder' },
    { name: 'description', content: 'Manage your projects from web.recoder.xyz' },
  ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  // Verify authentication
  const session = await verifySession(request);

  const env = context.cloudflare.env;
  const chatDB = createChatHistoryDB(env);

  try {
    // Get user's projects
    const projects = await chatDB.getChatHistory(
      session?.user?.id,
      session?.user?.id, // Use userId as fallback for anonymousId
      50
    );

    return json({
      projects,
      user: session?.user || null,
    });
  } catch (error) {
    console.error('Failed to load projects:', error);
    return json({ projects: [], user: null });
  }
}

export default function ProjectsPage() {
  const { projects, user } = useLoaderData<typeof loader>();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCommand = (command: string, id: string) => {
    navigator.clipboard.writeText(command);
    setCopiedId(id);
    toast.success('Command copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/"
            className="text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary mb-4 inline-flex items-center gap-2"
          >
            <div className="i-ph:arrow-left" />
            Back to Home
          </Link>

          <h1 className="text-4xl font-bold text-bolt-elements-textPrimary mt-4">
            My Projects
          </h1>
          <p className="text-bolt-elements-textSecondary mt-2">
            Download projects to your local machine with the CLI!
          </p>
        </div>

        {/* Create New Project CTA */}
        <div className="bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg p-6 mb-8 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">🚀 Create New Project</h2>
              <p className="text-orange-50">Start building in the browser, continue in your terminal!</p>
            </div>
            <Link
              to="/"
              className="bg-white text-orange-600 px-6 py-3 rounded-lg font-semibold hover:bg-orange-50 transition-colors"
            >
              New Project
            </Link>
          </div>
        </div>

        {/* Projects List */}
        {projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-2xl font-semibold text-bolt-elements-textPrimary mb-2">
              No projects yet
            </h3>
            <p className="text-bolt-elements-textSecondary mb-6">
              Create your first project to get started!
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-orange-700 hover:to-purple-700 transition-all"
            >
              <div className="i-ph:rocket-launch" />
              Start Building
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project: any) => (
              <div
                key={project.id}
                className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor hover:shadow-lg transition-all p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2 truncate">
                      {project.description || 'Untitled Project'}
                    </h3>

                    <div className="flex items-center gap-4 text-sm text-bolt-elements-textSecondary mb-4">
                      <span className="flex items-center gap-1">
                        <div className="i-ph:chat-circle-dots" />
                        {project.messageCount || 0} messages
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="i-ph:clock" />
                        {new Date(project.timestamp).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="i-ph:code" />
                        {project.urlId.substring(0, 8)}...
                      </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/chat/${project.urlId}`}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        <div className="i-ph:folder-open" />
                        Open Project
                      </Link>

                      <button
                        onClick={() => copyCommand(`recoder projects download ${project.urlId}`, project.urlId)}
                        className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        <div className="i-ph:download" />
                        {copiedId === project.urlId ? 'Copied!' : 'Download'}
                      </button>

                      <button
                        onClick={() => copyCommand(`recoder projects info ${project.urlId}`, `info-${project.urlId}`)}
                        className="inline-flex items-center gap-2 bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        <div className="i-ph:info" />
                        {copiedId === `info-${project.urlId}` ? 'Copied!' : 'Info'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* CLI Instructions (Expandable) */}
                <details className="mt-4 pt-4 border-t border-bolt-elements-borderColor">
                  <summary className="cursor-pointer text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary flex items-center gap-2">
                    <div className="i-ph:terminal-window" />
                    Show CLI Commands
                  </summary>

                  <div className="mt-3 space-y-2 bg-bolt-elements-background-depth-3 rounded-lg p-4">
                    <div className="text-xs font-medium text-bolt-elements-textTertiary mb-2">
                      Terminal Commands:
                    </div>

                    <div className="bg-black text-green-400 rounded p-2 font-mono text-xs">
                      <div># Download project to local</div>
                      <div className="text-white">$ recoder projects download {project.urlId}</div>
                    </div>

                    <div className="bg-black text-green-400 rounded p-2 font-mono text-xs">
                      <div># Open in browser</div>
                      <div className="text-white">$ recoder projects open {project.urlId}</div>
                    </div>

                    <div className="bg-black text-green-400 rounded p-2 font-mono text-xs">
                      <div># View project info</div>
                      <div className="text-white">$ recoder projects info {project.urlId}</div>
                    </div>

                    <div className="bg-black text-orange-400 rounded p-2 font-mono text-xs border border-orange-500/30">
                      <div># Upload changes back to web</div>
                      <div className="text-white">$ recoder projects upload {project.urlId}</div>
                    </div>

                    <button
                      onClick={() => {
                        const allCommands = `# Download project
recoder projects download ${project.urlId}

# Open in browser
recoder projects open ${project.urlId}

# View info
recoder projects info ${project.urlId}

# Upload changes back
recoder projects upload ${project.urlId}`;
                        copyCommand(allCommands, `all-${project.urlId}`);
                      }}
                      className="mt-2 text-xs text-orange-600 hover:text-orange-700 font-medium"
                    >
                      {copiedId === `all-${project.urlId}` ? '✓ Copied all commands!' : 'Copy all commands'}
                    </button>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}

        {/* CLI Setup Guide */}
        {projects.length > 0 && (
          <div className="mt-12 bg-gradient-to-r from-purple-500/10 to-orange-500/10 rounded-lg p-6 border border-bolt-elements-borderColor">
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-3 flex items-center gap-2">
              <div className="i-ph:info" />
              Using the CLI for the first time?
            </h3>

            <div className="space-y-3 text-sm text-bolt-elements-textSecondary">
              <div>
                <strong className="text-bolt-elements-textPrimary">1. Install the CLI:</strong>
                <div className="bg-black text-green-400 rounded p-2 font-mono text-xs mt-1">
                  $ npm install -g recoder-cli
                </div>
              </div>

              <div>
                <strong className="text-bolt-elements-textPrimary">2. Authenticate:</strong>
                <div className="bg-black text-green-400 rounded p-2 font-mono text-xs mt-1">
                  $ recoder auth login --device-flow
                </div>
              </div>

              <div>
                <strong className="text-bolt-elements-textPrimary">3. List your projects:</strong>
                <div className="bg-black text-green-400 rounded p-2 font-mono text-xs mt-1">
                  $ recoder projects list
                </div>
              </div>

              <div className="pt-3 border-t border-bolt-elements-borderColor">
                <p className="text-xs text-bolt-elements-textTertiary">
                  💡 <strong>Tip:</strong> The CLI lets you download web projects to your local machine,
                  edit with your favorite editor, and upload changes back to the web - seamless bidirectional sync!
                </p>
                <p className="text-xs text-bolt-elements-textTertiary mt-2">
                  🔄 <strong>Full workflow:</strong> Download → Edit locally → Upload → Continue in web
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
