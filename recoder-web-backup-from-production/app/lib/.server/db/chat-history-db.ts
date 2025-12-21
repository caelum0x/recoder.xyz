/**
 * Database operations for chat history
 * Persists chats to PostgreSQL/Neon instead of IndexedDB
 */

import { neon } from '@neondatabase/serverless';
import type { Message } from 'ai';

export interface ChatSession {
  id: string;
  user_id?: string;
  anonymous_id?: string;
  title?: string;
  description?: string;
  url_id: string;
  total_messages: number;
  last_message_at?: Date;
  project_id?: string;
  artifact_id?: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_used?: string;
  tokens_used?: number;
  stream_complete: boolean;
  tool_calls?: any;
  artifacts?: any;
  metadata: Record<string, any>;
  created_at: Date;
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
  }): Promise<ChatSession> {
    const result = await this.sql`
      INSERT INTO chat_sessions (
        "userId",
        "anonymousId",
        "urlId",
        title,
        description,
        "artifactId"
      ) VALUES (
        ${data.userId || null},
        ${data.anonymousId || null},
        ${data.urlId},
        ${data.title || null},
        ${data.description || null},
        ${data.artifactId || null}
      )
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
    const setParts: string[] = [];
    
    if (data.title !== undefined) {
      setParts.push(`title = '${data.title.replace(/'/g, "''")}'`);
    }
    if (data.description !== undefined) {
      setParts.push(`description = '${data.description.replace(/'/g, "''")}'`);
    }
    if (data.artifactId !== undefined) {
      setParts.push(`artifact_id = '${data.artifactId.replace(/'/g, "''")}'`);
    }
    if (data.metadata !== undefined) {
      setParts.push(`metadata = '${JSON.stringify(data.metadata).replace(/'/g, "''")}'::jsonb`);
    }

    if (setParts.length > 0) {
      setParts.push('updated_at = NOW()');
      const setClause = setParts.join(', ');
      
      // Use sql.query() for dynamic SQL with placeholders
      await this.sql.query(`
        UPDATE chat_sessions
        SET ${setClause}
        WHERE id = $1
      `, [sessionId]);
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
    const result = await this.sql`
      INSERT INTO chat_messages (
        session_id,
        role,
        content,
        model_used,
        tokens_used,
        tool_calls,
        artifacts,
        metadata
      ) VALUES (
        ${data.sessionId},
        ${data.role},
        ${data.content},
        ${data.modelUsed || null},
        ${data.tokensUsed || 0},
        ${JSON.stringify(data.toolCalls || null)},
        ${JSON.stringify(data.artifacts || null)},
        ${JSON.stringify(data.metadata || {})}
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
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
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
      ORDER BY updated_at DESC
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
      ORDER BY updated_at DESC
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
    await this.sql`
      UPDATE chat_messages
      SET content = ${content}, updated_at = NOW()
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
      });

      // Update with metadata
      await this.updateSession(session.id, {
        metadata: sessionMetadata,
      });
    } else {
      // Update existing session with new metadata
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
      SET total_messages = ${data.messages.length},
          last_message_at = NOW(),
          updated_at = NOW()
      WHERE id = ${session.id}
    `;

    console.log('✅ [saveChat] Complete chat saved:', {
      sessionId: session.id,
      urlId: session.url_id,
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
      urlId: session.url_id,
      messageCount: messages.length,
      fileCount: Object.keys(fileSnapshot).length,
    });

    return {
      id: session.id,
      urlId: session.url_id,
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
      urlId: session.url_id,
      description: session.description || session.title || 'Untitled Chat',
      timestamp: session.updated_at.toISOString(),
      messageCount: session.total_messages,
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
