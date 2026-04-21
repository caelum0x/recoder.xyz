import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import crypto from 'node:crypto';
import { ProjectsDB } from '~/lib/.server/db/projects-db';
import { loadStarterFiles } from '~/lib/.server/llm/starter-loader';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectDetail');

function getHubApiBaseUrl(context?: LoaderFunctionArgs['context'] | ActionFunctionArgs['context']): string {
  const env = (context as any)?.cloudflare?.env as Record<string, string | undefined> | undefined;
  return (
    env?.MAIN_SITE_URL ||
    env?.APP_URL ||
    process.env.MAIN_SITE_URL ||
    process.env.APP_URL ||
    'https://recoder.xyz'
  ).replace(/\/$/, '');
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildInternalServiceHeaders(input: {
  method: string;
  pathname: string;
  body: string;
  serviceKey: string;
  userId?: string | null;
}): Headers {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const payload = [
    timestamp,
    nonce,
    input.method.toUpperCase(),
    input.pathname,
    sha256(input.body),
  ].join('.');

  const signature = crypto
    .createHmac('sha256', input.serviceKey)
    .update(payload)
    .digest('hex');

  const headers = new Headers({
    'Content-Type': 'application/json',
    'x-internal-service-key': input.serviceKey,
    'x-internal-timestamp': timestamp,
    'x-internal-nonce': nonce,
    'x-internal-signature': signature,
  });
  if (input.userId) {
    headers.set('x-user-id', input.userId);
  }
  return headers;
}

type HubProjectDetail = {
  id: string;
  urlId?: string | null;
  title?: string | null;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  fileSnapshot?: Record<string, string>;
  directories?: string[];
};

function mapHubProjectToLegacyProject(projectId: string, userId: string | null, hubProject: HubProjectDetail) {
  return {
    id: projectId,
    name: hubProject.title || hubProject.description || 'Untitled Project',
    type: 'web',
    description: hubProject.description || '',
    status: 'active',
    config: {},
    isPrivate: true,
    metadata: {
      source: 'project_snapshots',
      urlId: hubProject.urlId || null,
      directories: hubProject.directories || [],
    },
    userId: userId || '',
    createdAt: hubProject.createdAt ? new Date(hubProject.createdAt) : new Date(0),
    updatedAt: hubProject.updatedAt ? new Date(hubProject.updatedAt) : new Date(),
  };
}

function getEnv(context?: LoaderFunctionArgs['context'] | ActionFunctionArgs['context']) {
  return ((context as any)?.cloudflare?.env || process.env) as Record<string, string | undefined>;
}

function inferStarterIdFromMessages(messages: Array<{ role: string; content: string }>): string {
  const combined = messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content || '')
    .join('\n\n');

  if (
    combined.includes('Hello {name}!') ||
    combined.includes("react-scripts start") ||
    combined.includes("export const App: FC<{ name: string }> = ({ name }) =>")
  ) {
    return 'react-ts';
  }

  return 'bolt-vite-react-ts';
}

function extractRecoveredFilesFromMessages(
  messages: Array<{ role: string; content: string }>,
  baseFiles: Record<string, string>,
): Record<string, string> {
  const recovered = { ...baseFiles };

  const decodeXmlAttr = (value: string) =>
    value
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

  for (const message of messages) {
    if (message.role !== 'assistant' || !message.content) continue;
    const content = message.content;

    const fileRegex = /<recoderAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/recoderAction>/g;
    let match: RegExpExecArray | null;
    while ((match = fileRegex.exec(content)) !== null) {
      recovered[match[1]] = match[2].trim();
    }

    const editRegex = /<recoderAction[^>]*type="edit"[^>]*filePath="([^"]+)"[^>]*oldText="([^"]*)"[^>]*newText="([^"]*)"[^>]*>/g;
    while ((match = editRegex.exec(content)) !== null) {
      const filePath = match[1];
      const oldText = decodeXmlAttr(match[2]);
      const newText = decodeXmlAttr(match[3]);
      if (typeof recovered[filePath] === 'string' && oldText.length > 0) {
        recovered[filePath] = recovered[filePath].replace(oldText, newText);
      }
    }

    const replaceRegex = /<recoderAction[^>]*type="str_replace"[^>]*filePath="([^"]+)"[^>]*oldString="([^"]*)"[^>]*newString="([^"]*)"[^>]*>/g;
    while ((match = replaceRegex.exec(content)) !== null) {
      const filePath = match[1];
      const oldString = decodeXmlAttr(match[2]);
      const newString = decodeXmlAttr(match[3]);
      if (typeof recovered[filePath] === 'string' && oldString.length > 0) {
        recovered[filePath] = recovered[filePath].replace(oldString, newString);
      }
    }

    const finalizedBlockRegex = /finalized\s+`([^`]+)`\s+file will look like this:\s*```[a-zA-Z0-9_-]*\n([\s\S]*?)```/gi;
    while ((match = finalizedBlockRegex.exec(content)) !== null) {
      recovered[match[1]] = match[2].trim();
    }
  }

  return recovered;
}

async function recoverFileSnapshotFromChat(
  chats: Array<{ id: string }>,
  projectsDB: ProjectsDB,
): Promise<Record<string, string>> {
  const latestChat = chats[0];
  if (!latestChat?.id) {
    return {};
  }

  const messages = await projectsDB.getChatMessages(latestChat.id);
  if (!messages.length) {
    return {};
  }

  const starterId = inferStarterIdFromMessages(messages);
  const starter = await loadStarterFiles(starterId);
  return extractRecoveredFilesFromMessages(messages, starter.files);
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  try {
    const { projectId } = params;
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!projectId) {
      return json({ error: 'Project ID required' }, { status: 400 });
    }

    const env = getEnv(context);
    const internalServiceKey =
      env?.INTERNAL_SERVICE_KEY ||
      '';
    const hubBaseUrl =
      env?.MAIN_SITE_INTERNAL_URL ||
      getHubApiBaseUrl(context);

    if (internalServiceKey && userId) {
      try {
        const pathname = `/api/projects/${encodeURIComponent(projectId)}`;
        const hubUrl = new URL(pathname, hubBaseUrl);
        const headers = buildInternalServiceHeaders({
          method: 'GET',
          pathname,
          body: '',
          serviceKey: internalServiceKey,
          userId,
        });
        const response = await fetch(hubUrl.toString(), {
          headers,
        });

        if (response.ok) {
          const payload = await response.json() as { success?: boolean; data?: HubProjectDetail };
          const hubProject = payload.data;
          if (hubProject) {
            return json({
              project: {
                ...mapHubProjectToLegacyProject(projectId, userId, hubProject),
                fileSnapshot: hubProject.fileSnapshot || {},
              },
            });
          }
        } else {
          logger.warn('Hub project detail request failed', {
            projectId,
            status: response.status,
          });
          return json({ error: 'Project snapshots unavailable' }, { status: response.status });
        }
      } catch (error) {
        logger.warn('Hub project detail request threw', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
        return json({ error: 'Project snapshots unavailable' }, { status: 502 });
      }
    }

    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);
    const project = await projectsDB.getProject(projectId, userId || undefined);
    const chats = await projectsDB.getProjectChats(projectId);
    const latestChat = Array.isArray(chats) ? chats[0] as { metadata?: { fileSnapshot?: Record<string, string> } } | undefined : undefined;
    let fileSnapshot = latestChat?.metadata?.fileSnapshot || {};

    if (Object.keys(fileSnapshot).length === 0 && Array.isArray(chats) && chats.length > 0) {
      fileSnapshot = await recoverFileSnapshotFromChat(chats as Array<{ id: string }>, projectsDB);
    }

    if (!project && Object.keys(fileSnapshot).length === 0) {
      return json({ error: 'Project not found' }, { status: 404 });
    }

    return json({
      project: {
        ...(project || {
          id: projectId,
          name: 'Recovered Project',
          type: 'web',
          status: 'active',
          config: {},
          isPrivate: true,
          metadata: {},
          userId: userId || '',
          createdAt: new Date(0),
          updatedAt: new Date(),
        }),
        fileSnapshot,
      },
    });
  } catch (error) {
    logger.error('Project API loader error:', error);
    return json({ error: 'Failed to load project' }, { status: 500 });
  }
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  try {
    const { projectId } = params;

    if (!projectId) {
      return json({ error: 'Project ID required' }, { status: 400 });
    }

    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);
    const data = await request.json() as Record<string, unknown>;
    const userId = data.userId as string;

    if (!userId) {
      return json({ error: 'User ID required' }, { status: 400 });
    }

    // PUT - Update project
    if (request.method === 'PUT') {
      const { name, description, framework, language, isPrivate } = data as {
        name?: string;
        description?: string;
        framework?: string;
        language?: string;
        isPrivate?: boolean;
      };

      const project = await projectsDB.updateProject(projectId, {
        name,
        description,
        framework,
        language,
        isPrivate,
      }, userId);

      if (!project) {
        return json({ error: 'Project not found or unauthorized' }, { status: 404 });
      }

      return json({ success: true, project });
    }

    // DELETE - Delete project
    if (request.method === 'DELETE') {
      const deleted = await projectsDB.deleteProject(projectId, userId);

      if (!deleted) {
        return json({ error: 'Project not found or unauthorized' }, { status: 404 });
      }

      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    logger.error('Project API action error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
