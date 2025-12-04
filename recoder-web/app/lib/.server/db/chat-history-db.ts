/**
 * Database operations for chat history
 * Persists chats to PostgreSQL/Neon instead of IndexedDB
 */

import { neon } from '@neondatabase/serverless';
import type { Message } from 'ai';

/**
 * Sanitize content for PostgreSQL UTF8 encoding
 * Removes null bytes (0x00) and other invalid UTF8 sequences
 */
function sanitizeContent(content: string): string {
  if (!content) return content;

  // Remove null bytes (0x00) which cause "invalid byte sequence for encoding UTF8" error
  let sanitized = content.replace(/\0/g, '');

  // Remove other potentially problematic characters
  // Keep only valid UTF-8 characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  return sanitized;
}

export interface ChatSession {
  id: string;
  userId?: string;
  anonymousId?: string;
  title?: string;
  description?: string;
  urlId: string;
  totalMessages: number;
  lastMessageAt?: Date;
  projectId?: string;
  artifactId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export class ChatHistoryDB {
  private sql: ReturnType<typeof neon>;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  /**
   * Create a new chat session
   */
  async createSession(data: {
    userId?: string;
    anonymousId?: string;
    urlId: string;
    title?: string;
    description?: string;
    artifactId?: string;
    projectId?: string;
  }): Promise<ChatSession> {
    const result = await this.sql`
      INSERT INTO chat_sessions (
        id,
        "userId",
        "anonymousId",
        "urlId",
        title,
        description,
        "artifactId",
        "projectId",
        "createdAt",
        "updatedAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${data.userId || null},
        ${data.anonymousId || null},
        ${data.urlId},
        ${data.title || null},
        ${data.description || null},
        ${data.artifactId || null},
        ${data.projectId || null},
        NOW(),
        NOW()
      )
      ON CONFLICT ("urlId") DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        "artifactId" = EXCLUDED."artifactId",
        "projectId" = COALESCE(EXCLUDED."projectId", chat_sessions."projectId"),
        "updatedAt" = NOW()
      RETURNING *
    ` as unknown as ChatSession[];

    return result[0];
  }

  /**
   * Get chat session by URL ID
   */
  async getSessionByUrlId(urlId: string): Promise<ChatSession | null> {
    const result = await this.sql`
      SELECT * FROM chat_sessions
      WHERE "urlId" = ${urlId}
      LIMIT 1
    ` as unknown as ChatSession[];

    return result[0] || null;
  }

  /**
   * Get chat session by ID
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    const result = await this.sql`
      SELECT * FROM chat_sessions
      WHERE id = ${sessionId}
      LIMIT 1
    ` as unknown as ChatSession[];

    return result[0] || null;
  }

  /**
   * Update chat session
   */
  async updateSession(
    sessionId: string,
    data: {
      title?: string;
      description?: string;
      artifactId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    // Use parameterized query to safely handle large JSON objects
    const updates: any = { updatedAt: new Date() };
    
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.artifactId !== undefined) updates.artifact_id = data.artifactId;
    if (data.metadata !== undefined) {
      // Safely pass metadata as JSON parameter
      updates.metadata = data.metadata;
    }

    // Build update query safely - Neon uses ${} template literals
    if (data.title !== undefined) {
      await this.sql`UPDATE chat_sessions SET title = ${data.title}, "updatedAt" = NOW() WHERE id = ${sessionId}`;
    }
    if (data.description !== undefined) {
      await this.sql`UPDATE chat_sessions SET description = ${data.description}, "updatedAt" = NOW() WHERE id = ${sessionId}`;
    }
    if (data.artifactId !== undefined) {
      await this.sql`UPDATE chat_sessions SET "artifactId" = ${data.artifactId}, "updatedAt" = NOW() WHERE id = ${sessionId}`;
    }
    if (data.metadata !== undefined) {
      // Safely pass large JSON objects - Neon handles this correctly
      const metadataJson = JSON.stringify(data.metadata);
      await this.sql`UPDATE chat_sessions SET metadata = ${metadataJson}::jsonb, "updatedAt" = NOW() WHERE id = ${sessionId}`;
    }
  }

  /**
   * Add message to session
   */
  async addMessage(data: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    modelUsed?: string;
    tokensUsed?: number;
    toolCalls?: any;
    artifacts?: any;
    metadata?: Record<string, any>;
  }): Promise<ChatMessage> {
    // Sanitize content to prevent UTF8 encoding errors
    const sanitizedContent = sanitizeContent(data.content);

    const result = await this.sql`
      INSERT INTO chat_messages (
        id,
        "sessionId",
        role,
        content,
        metadata,
        "createdAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${data.sessionId},
        ${data.role},
        ${sanitizedContent},
        ${JSON.stringify(data.metadata || {})}::jsonb,
        NOW()
      )
      RETURNING *
    ` as unknown as ChatMessage[];

    return result[0];
  }

  /**
   * Get all messages for a session
   */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const result = await this.sql`
      SELECT * FROM chat_messages
      WHERE "sessionId" = ${sessionId}
      ORDER BY "createdAt" ASC
    `;

    return result as ChatMessage[];
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(
    userId: string,
    limit: number = 50
  ): Promise<ChatSession[]> {
    const result = await this.sql`
      SELECT * FROM chat_sessions
      WHERE "userId" = ${userId}
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `;

    return result as ChatSession[];
  }

  /**
   * Get all sessions for an anonymous user
   */
  async getAnonymousSessions(
    anonymousId: string,
    limit: number = 50
  ): Promise<ChatSession[]> {
    const result = await this.sql`
      SELECT * FROM chat_sessions
      WHERE "anonymousId" = ${anonymousId}
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `;

    return result as ChatSession[];
  }

  /**
   * Delete a chat session and all its messages
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.sql`
      DELETE FROM chat_sessions
      WHERE id = ${sessionId}
    `;
  }

  /**
   * Claim anonymous sessions when user signs up
   */
  async claimAnonymousSessions(
    anonymousId: string,
    userId: string
  ): Promise<number> {
    const result = await this.sql`
      SELECT claim_anonymous_sessions(${anonymousId}, ${userId}) as count
    ` as unknown as Array<{ count: number }>;

    return result[0]?.count || 0;
  }

  /**
   * Update an existing message
   */
  async updateMessage(messageId: string, content: string): Promise<void> {
    // Sanitize content to prevent UTF8 encoding errors
    const sanitizedContent = sanitizeContent(content);

    await this.sql`
      UPDATE chat_messages
      SET content = ${sanitizedContent}, "updatedAt" = NOW()
      WHERE id = ${messageId}
    `;
  }

  /**
   * Save complete chat session (backwards compatible with IndexedDB format)
   */
  async saveChat(data: {
    userId?: string;
    anonymousId?: string;
    urlId: string;
    title?: string;
    description?: string;
    messages: Message[];
    artifactId?: string;
    fileSnapshot?: Record<string, string>;
    projectId?: string;
  }): Promise<ChatSession> {
    // Check if session exists
    let session = await this.getSessionByUrlId(data.urlId);

    // Calculate file snapshot stats
    const fileCount = data.fileSnapshot ? Object.keys(data.fileSnapshot).length : 0;
    const totalFileSize = data.fileSnapshot 
      ? Object.values(data.fileSnapshot).reduce((sum, content) => sum + content.length, 0)
      : 0;

    // Prepare metadata with file snapshot
    const sessionMetadata = {
      fileSnapshot: data.fileSnapshot || {},
      fileCount,
      totalFileSize,
      lastUpdated: new Date().toISOString(),
    };

    if (!session) {
      // Create new session
      session = await this.createSession({
        userId: data.userId,
        anonymousId: data.anonymousId,
        urlId: data.urlId,
        title: data.title,
        description: data.description,
        artifactId: data.artifactId,
        projectId: data.projectId,
      });

      // Update with metadata
      await this.updateSession(session.id, {
        metadata: sessionMetadata,
      });
    } else {
      // Update existing session with new metadata (and projectId if provided)
      await this.updateSession(session.id, {
        title: data.title,
        description: data.description,
        artifactId: data.artifactId,
        metadata: sessionMetadata,
      });
    }

    // Get existing messages to compare and update
    const existingMessages = await this.getMessages(session.id);

    console.log('💾 [saveChat] Syncing messages:', {
      sessionId: session.id,
      existingCount: existingMessages.length,
      newCount: data.messages.length,
      fileCount,
      totalFileSize: `${(totalFileSize / 1024).toFixed(2)} KB`,
    });

    // Process all messages - add new ones and update existing ones
    for (let i = 0; i < data.messages.length; i++) {
      const msg = data.messages[i];
      const existingMsg = existingMessages[i];

      if (existingMsg) {
        // Message exists - check if content has changed (e.g., during streaming)
        if (existingMsg.content !== msg.content) {
          const oldSize = existingMsg.content.length;
          const newSize = msg.content.length;
          console.log(`💾 [saveChat] Updating message ${i} (${msg.role}): ${oldSize} -> ${newSize} chars`);
          await this.updateMessage(existingMsg.id, msg.content);
        }
      } else {
        // New message - add it
        const contentSize = msg.content.length;
        console.log(`💾 [saveChat] Adding new message ${i} (${msg.role}): ${contentSize} chars`);
        await this.addMessage({
          sessionId: session.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          metadata: {},
        });
      }
    }

    // Update message count
    await this.sql`
      UPDATE chat_sessions
      SET "totalMessages" = ${data.messages.length},
          "lastMessageAt" = NOW(),
          "updatedAt" = NOW()
      WHERE id = ${session.id}
    `;

    console.log('✅ [saveChat] Complete chat saved:', {
      sessionId: session.id,
      urlId: session.urlId,
      messages: data.messages.length,
      files: fileCount,
    });

    return session;
  }

  /**
   * Load chat session (backwards compatible with IndexedDB format)
   */
  async loadChat(urlId: string): Promise<{
    id: string;
    urlId: string;
    description?: string;
    messages: Message[];
    fileSnapshot?: Record<string, string>;
  } | null> {
    const session = await this.getSessionByUrlId(urlId);

    if (!session) {
      return null;
    }

    const dbMessages = await this.getMessages(session.id);

    const messages: Message[] = dbMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at,
    }));

    // Extract file snapshot from metadata
    const fileSnapshot = session.metadata?.fileSnapshot || {};

    console.log('📂 [loadChat] Loaded chat with file snapshot:', {
      sessionId: session.id,
      urlId: session.urlId,
      messageCount: messages.length,
      fileCount: Object.keys(fileSnapshot).length,
    });

    return {
      id: session.id,
      urlId: session.urlId,
      description: session.description || undefined,
      messages,
      fileSnapshot,
    };
  }

  /**
   * Get chat history list (backwards compatible with IndexedDB format)
   */
  async getChatHistory(
    userId?: string,
    anonymousId?: string,
    limit: number = 50
  ): Promise<Array<{
    id: string;
    urlId: string;
    description: string;
    timestamp: string;
    messageCount: number;
  }>> {
    let sessions: ChatSession[];

    if (userId) {
      sessions = await this.getUserSessions(userId, limit);
    } else if (anonymousId) {
      sessions = await this.getAnonymousSessions(anonymousId, limit);
    } else {
      return [];
    }

    return sessions.map((session) => ({
      id: session.id,
      urlId: session.urlId,
      description: session.description || session.title || 'Untitled Chat',
      timestamp: session.updatedAt.toISOString(),
      messageCount: session.totalMessages,
    }));
  }
}

/**
 * Create chat history database client
 */
export function createChatHistoryDB(env: any): ChatHistoryDB {
  const databaseUrl = env.DATABASE_URL || env.NEON_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  return new ChatHistoryDB(databaseUrl);
}
