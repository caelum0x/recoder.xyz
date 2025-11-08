/**
 * API endpoint for uploading/syncing files from CLI to web
 * POST /api/projects/upload
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createChatHistoryDB } from '~/lib/.server/db/chat-history-db';
import { verifySession } from '~/lib/auth/session.server';

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // Verify authentication
    const session = await verifySession(request);

    if (!session?.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const env = context.cloudflare.env;
    const chatDB = createChatHistoryDB(env);

    // Parse request body
    const body = await request.json();
    const { urlId, files, message } = body;

    if (!urlId || !files) {
      return json({ error: 'Missing required fields: urlId, files' }, { status: 400 });
    }

    console.log('📤 [api.projects.upload] Upload request:', {
      urlId,
      fileCount: Object.keys(files).length,
      userId: session.user.id,
      message: message || 'No message',
    });

    // Load existing chat/project
    const existingChat = await chatDB.loadChat(urlId);

    if (!existingChat) {
      return json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify user owns this project
    // TODO: Add ownership check when user_id is tracked in chat_sessions

    // Merge uploaded files with existing chat
    const updatedFileSnapshot = {
      ...(existingChat.fileSnapshot || {}),
      ...files,
    };

    // Add a system message about the upload
    const systemMessage = {
      id: `upload-${Date.now()}`,
      role: 'system' as const,
      content: message || `Files uploaded from CLI (${Object.keys(files).length} files)`,
      createdAt: new Date(),
    };

    const updatedMessages = [
      ...existingChat.messages,
      systemMessage,
    ];

    // Save updated chat with new files
    await chatDB.saveChat({
      userId: session.user.id,
      urlId,
      title: existingChat.description,
      description: existingChat.description,
      messages: updatedMessages,
      fileSnapshot: updatedFileSnapshot,
    });

    console.log('✅ [api.projects.upload] Files uploaded successfully:', {
      urlId,
      totalFiles: Object.keys(updatedFileSnapshot).length,
      uploadedFiles: Object.keys(files).length,
    });

    return json({
      success: true,
      data: {
        urlId,
        filesUploaded: Object.keys(files).length,
        totalFiles: Object.keys(updatedFileSnapshot).length,
        message: 'Files uploaded successfully',
      },
    });

  } catch (error) {
    console.error('❌ [api.projects.upload] Upload failed:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload files',
      },
      { status: 500 }
    );
  }
}
