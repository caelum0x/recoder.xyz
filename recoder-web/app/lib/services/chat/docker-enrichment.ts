import { dockerFetchJson } from '~/lib/http/docker-server';
import { getProjectConfigPrompt } from '~/lib/services/project-config';
import type { Messages } from '~/lib/types/chat';

export async function loadProjectConfigPromptFromDocker(
  dockerUrl: string,
  containerId: string | undefined,
  headers: Record<string, string>,
): Promise<string> {
  if (!containerId) return '';

  try {
    return await getProjectConfigPrompt(async (path) => {
      try {
        const data = await dockerFetchJson<{ content?: string }>(
          `${dockerUrl}/api/files/read?path=${encodeURIComponent(path)}&containerId=${encodeURIComponent(containerId)}`,
          { method: 'GET' },
          headers,
        );
        return data.content || null;
      } catch {
        return null;
      }
    });
  } catch {
    return '';
  }
}

export async function loadThemePromptFromDocker(
  dockerUrl: string,
  projectId: string | undefined,
  headers: Record<string, string>,
): Promise<string> {
  if (!projectId) return '';

  try {
    const themeData = await dockerFetchJson<{ data?: { themePrompt?: string } }>(
      `${dockerUrl}/api/themes/project/${encodeURIComponent(projectId)}`,
      { method: 'GET' },
      headers,
    );

    if (themeData?.data?.themePrompt) {
      return `\n\n${themeData.data.themePrompt}`;
    }
  } catch {
    // Best-effort only.
  }

  return '';
}

export async function resolvePromptMentionsBestEffort(
  messages: Messages,
  dockerUrl: string,
  headers: Record<string, string>,
): Promise<void> {
  for (const msg of messages) {
    if (msg.role !== 'user' || typeof msg.content !== 'string' || !msg.content.includes('@prompt:')) {
      continue;
    }

    try {
      const resolveData = await dockerFetchJson<{ data?: { resolved?: string } }>(
        `${dockerUrl}/api/prompts/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({ text: msg.content }),
        },
        headers,
      );

      if (resolveData?.data?.resolved) {
        msg.content = resolveData.data.resolved;
      }
    } catch {
      // Best-effort only.
    }
  }
}

const FILE_MENTION_RE = /@file:(\S+)/g;
const FOLDER_MENTION_RE = /@folder:(\S+)/g;

/**
 * Resolve @file: and @folder: mentions in user messages.
 * Fetches file content / directory listing from Docker backend
 * and appends it as structured context within the message.
 */
export async function resolveFileMentionsBestEffort(
  messages: Messages,
  dockerUrl: string,
  containerId: string | undefined,
  headers: Record<string, string>,
): Promise<void> {
  if (!containerId) return;

  for (const msg of messages) {
    if (msg.role !== 'user' || typeof msg.content !== 'string') continue;

    const content = msg.content;
    const hasFileMention = content.includes('@file:');
    const hasFolderMention = content.includes('@folder:');
    if (!hasFileMention && !hasFolderMention) continue;

    const contextBlocks: string[] = [];
    const mentionsToStrip: { full: string; label: string }[] = [];

    // Resolve @file: mentions
    if (hasFileMention) {
      const fileMatches = [...content.matchAll(FILE_MENTION_RE)];
      const fetches = fileMatches.map(async (match) => {
        const filePath = match[1];
        try {
          const data = await dockerFetchJson<{ content?: string }>(
            `${dockerUrl}/api/files/read?path=${encodeURIComponent(filePath)}&containerId=${encodeURIComponent(containerId)}`,
            { method: 'GET' },
            headers,
          );
          if (data.content) {
            contextBlocks.push(`<file path="${filePath}">\n${data.content}\n</file>`);
          }
        } catch {
          // File not found or unreadable — skip silently.
        }
        mentionsToStrip.push({ full: match[0], label: filePath });
      });
      await Promise.all(fetches);
    }

    // Resolve @folder: mentions
    if (hasFolderMention) {
      const folderMatches = [...content.matchAll(FOLDER_MENTION_RE)];
      const fetches = folderMatches.map(async (match) => {
        const folderPath = match[1];
        try {
          const data = await dockerFetchJson<{ files?: Array<{ name: string; type: string }> }>(
            `${dockerUrl}/api/files/list?path=${encodeURIComponent(folderPath)}&containerId=${encodeURIComponent(containerId)}`,
            { method: 'GET' },
            headers,
          );
          if (data.files && data.files.length > 0) {
            const listing = data.files
              .map((f) => `  ${f.type === 'directory' ? '📁' : '📄'} ${f.name}`)
              .join('\n');
            contextBlocks.push(`<folder path="${folderPath}">\n${listing}\n</folder>`);
          }
        } catch {
          // Folder not found — skip silently.
        }
        mentionsToStrip.push({ full: match[0], label: folderPath });
      });
      await Promise.all(fetches);
    }

    if (contextBlocks.length > 0) {
      // Strip mention syntax from message text and append resolved context
      let cleanedContent = content;
      for (const m of mentionsToStrip) {
        cleanedContent = cleanedContent.replace(m.full, m.label);
      }
      msg.content = `${cleanedContent}\n\n<mentioned_context>\n${contextBlocks.join('\n')}\n</mentioned_context>`;
    }
  }
}
