/**
 * API endpoint for conversation state operations
 * Persists conversation context, message history, project evolution, and user preferences
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { neon } from '@neondatabase/serverless';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ConversationState');

// ============================================================================
// Types
// ============================================================================

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    editedFiles?: string[];
    addedPackages?: string[];
    editType?: string;
    sandboxId?: string;
  };
}

export interface ConversationEdit {
  timestamp: number;
  userRequest: string;
  editType: string;
  targetFiles: string[];
  confidence: number;
  outcome: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export interface ProjectEvolution {
  initialState?: string;
  majorChanges: Array<{
    timestamp: number;
    description: string;
    filesAffected: string[];
  }>;
}

export interface UserPreferences {
  editStyle?: 'targeted' | 'comprehensive';
  commonRequests?: string[];
  packagePreferences?: string[];
  [key: string]: unknown;
}

export interface ConversationContext {
  messages: ConversationMessage[];
  edits: ConversationEdit[];
  currentTopic?: string;
  projectEvolution: ProjectEvolution;
  userPreferences: UserPreferences;
}

export interface ConversationState {
  conversationId: string;
  startedAt: number;
  lastUpdated: number;
  context: ConversationContext;
}

// ============================================================================
// Database Class
// ============================================================================

class ConversationStateDB {
  private sql: ReturnType<typeof neon>;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  /**
   * Initialize the conversation_states table if it doesn't exist
   */
  async ensureTable(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS conversation_states (
        id TEXT PRIMARY KEY,
        "userId" TEXT,
        "anonymousId" TEXT,
        "projectId" TEXT,
        "conversationId" TEXT NOT NULL,
        "startedAt" BIGINT NOT NULL,
        "lastUpdated" BIGINT NOT NULL,
        context JSONB NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create indexes for efficient lookups
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_conversation_states_user_id
      ON conversation_states("userId")
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_conversation_states_project_id
      ON conversation_states("projectId")
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_conversation_states_conversation_id
      ON conversation_states("conversationId")
    `;
  }

  /**
   * Get conversation state by ID
   */
  async getState(stateId: string): Promise<ConversationState | null> {
    const result = await this.sql`
      SELECT * FROM conversation_states
      WHERE id = ${stateId}
      LIMIT 1
    ` as unknown as Array<{
      id: string;
      conversationId: string;
      startedAt: string;
      lastUpdated: string;
      context: ConversationContext;
    }>;

    if (!result[0]) {
      return null;
    }

    const row = result[0];
    return {
      conversationId: row.conversationId,
      startedAt: Number(row.startedAt),
      lastUpdated: Number(row.lastUpdated),
      context: row.context,
    };
  }

  /**
   * Get conversation state by project ID
   */
  async getStateByProject(projectId: string): Promise<ConversationState | null> {
    const result = await this.sql`
      SELECT * FROM conversation_states
      WHERE "projectId" = ${projectId}
      ORDER BY "lastUpdated" DESC
      LIMIT 1
    ` as unknown as Array<{
      id: string;
      conversationId: string;
      startedAt: string;
      lastUpdated: string;
      context: ConversationContext;
    }>;

    if (!result[0]) {
      return null;
    }

    const row = result[0];
    return {
      conversationId: row.conversationId,
      startedAt: Number(row.startedAt),
      lastUpdated: Number(row.lastUpdated),
      context: row.context,
    };
  }

  /**
   * Get conversation state by user ID (most recent)
   */
  async getStateByUser(userId: string): Promise<ConversationState | null> {
    const result = await this.sql`
      SELECT * FROM conversation_states
      WHERE "userId" = ${userId}
      ORDER BY "lastUpdated" DESC
      LIMIT 1
    ` as unknown as Array<{
      id: string;
      conversationId: string;
      startedAt: string;
      lastUpdated: string;
      context: ConversationContext;
    }>;

    if (!result[0]) {
      return null;
    }

    const row = result[0];
    return {
      conversationId: row.conversationId,
      startedAt: Number(row.startedAt),
      lastUpdated: Number(row.lastUpdated),
      context: row.context,
    };
  }

  /**
   * Create a new conversation state
   */
  async createState(data: {
    userId?: string;
    anonymousId?: string;
    projectId?: string;
    conversationId?: string;
  }): Promise<ConversationState> {
    const now = Date.now();
    const conversationId = data.conversationId || `conv-${now}`;
    const stateId = `state-${now}-${Math.random().toString(36).substr(2, 9)}`;

    const initialContext: ConversationContext = {
      messages: [],
      edits: [],
      projectEvolution: { majorChanges: [] },
      userPreferences: {},
    };

    await this.sql`
      INSERT INTO conversation_states (
        id,
        "userId",
        "anonymousId",
        "projectId",
        "conversationId",
        "startedAt",
        "lastUpdated",
        context
      ) VALUES (
        ${stateId},
        ${data.userId || null},
        ${data.anonymousId || null},
        ${data.projectId || null},
        ${conversationId},
        ${now},
        ${now},
        ${JSON.stringify(initialContext)}::jsonb
      )
    `;

    return {
      conversationId,
      startedAt: now,
      lastUpdated: now,
      context: initialContext,
    };
  }

  /**
   * Update conversation state context
   */
  async updateState(
    conversationId: string,
    updates: {
      currentTopic?: string;
      userPreferences?: Partial<UserPreferences>;
      addMessage?: ConversationMessage;
      addEdit?: ConversationEdit;
      addMajorChange?: {
        description: string;
        filesAffected: string[];
      };
    }
  ): Promise<ConversationState | null> {
    // First get the current state
    const result = await this.sql`
      SELECT * FROM conversation_states
      WHERE "conversationId" = ${conversationId}
      LIMIT 1
    ` as unknown as Array<{
      id: string;
      conversationId: string;
      startedAt: string;
      lastUpdated: string;
      context: ConversationContext;
    }>;

    if (!result[0]) {
      return null;
    }

    const row = result[0];
    const context = row.context;
    const now = Date.now();

    // Apply updates to context
    if (updates.currentTopic !== undefined) {
      context.currentTopic = updates.currentTopic;
    }

    if (updates.userPreferences) {
      context.userPreferences = {
        ...context.userPreferences,
        ...updates.userPreferences,
      };
    }

    if (updates.addMessage) {
      context.messages.push(updates.addMessage);
    }

    if (updates.addEdit) {
      context.edits.push(updates.addEdit);
    }

    if (updates.addMajorChange) {
      context.projectEvolution.majorChanges.push({
        timestamp: now,
        description: updates.addMajorChange.description,
        filesAffected: updates.addMajorChange.filesAffected,
      });
    }

    // Update in database
    await this.sql`
      UPDATE conversation_states
      SET
        "lastUpdated" = ${now},
        context = ${JSON.stringify(context)}::jsonb,
        "updatedAt" = NOW()
      WHERE "conversationId" = ${conversationId}
    `;

    return {
      conversationId: row.conversationId,
      startedAt: Number(row.startedAt),
      lastUpdated: now,
      context,
    };
  }

  /**
   * Clear old conversation data but keep recent context
   */
  async clearOldData(conversationId: string, options?: {
    keepMessages?: number;
    keepEdits?: number;
    keepMajorChanges?: number;
  }): Promise<ConversationState | null> {
    const keepMessages = options?.keepMessages ?? 5;
    const keepEdits = options?.keepEdits ?? 3;
    const keepMajorChanges = options?.keepMajorChanges ?? 2;

    // Get current state
    const result = await this.sql`
      SELECT * FROM conversation_states
      WHERE "conversationId" = ${conversationId}
      LIMIT 1
    ` as unknown as Array<{
      id: string;
      conversationId: string;
      startedAt: string;
      lastUpdated: string;
      context: ConversationContext;
    }>;

    if (!result[0]) {
      return null;
    }

    const row = result[0];
    const context = row.context;
    const now = Date.now();

    // Keep only recent data
    context.messages = context.messages.slice(-keepMessages);
    context.edits = context.edits.slice(-keepEdits);
    context.projectEvolution.majorChanges = context.projectEvolution.majorChanges.slice(-keepMajorChanges);

    // Update in database
    await this.sql`
      UPDATE conversation_states
      SET
        "lastUpdated" = ${now},
        context = ${JSON.stringify(context)}::jsonb,
        "updatedAt" = NOW()
      WHERE "conversationId" = ${conversationId}
    `;

    return {
      conversationId: row.conversationId,
      startedAt: Number(row.startedAt),
      lastUpdated: now,
      context,
    };
  }

  /**
   * Delete conversation state
   */
  async deleteState(conversationId: string): Promise<void> {
    await this.sql`
      DELETE FROM conversation_states
      WHERE "conversationId" = ${conversationId}
    `;
  }

  /**
   * Delete all states for a user
   */
  async deleteUserStates(userId: string): Promise<void> {
    await this.sql`
      DELETE FROM conversation_states
      WHERE "userId" = ${userId}
    `;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDatabase(env: any): ConversationStateDB | null {
  const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    logger.warn('[conversation-state] DATABASE_URL not configured');
    return null;
  }

  return new ConversationStateDB(databaseUrl);
}

// ============================================================================
// API Handlers
// ============================================================================

/**
 * GET /api/conversation-state - Retrieve conversation state
 * Query params:
 *   - conversationId: Get specific conversation
 *   - projectId: Get state by project
 *   - userId: Get most recent state for user
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const env = (context as any)?.cloudflare?.env || process.env;
    const db = getDatabase(env);

    if (!db) {
      return json({
        success: false,
        error: 'Database not configured',
      }, { status: 503 });
    }

    // Ensure table exists
    await db.ensureTable();

    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    const projectId = url.searchParams.get('projectId');
    const userId = url.searchParams.get('userId');

    let state: ConversationState | null = null;

    if (conversationId) {
      // Get by conversation ID
      const result = await db.getState(conversationId);

      if (!result) {
        // Try to find by conversationId field
        const searchResult = await (db as any).sql`
          SELECT * FROM conversation_states
          WHERE "conversationId" = ${conversationId}
          LIMIT 1
        ` as unknown as Array<{
          id: string;
          conversationId: string;
          startedAt: string;
          lastUpdated: string;
          context: ConversationContext;
        }>;

        if (searchResult[0]) {
          state = {
            conversationId: searchResult[0].conversationId,
            startedAt: Number(searchResult[0].startedAt),
            lastUpdated: Number(searchResult[0].lastUpdated),
            context: searchResult[0].context,
          };
        }
      } else {
        state = result;
      }
    } else if (projectId) {
      state = await db.getStateByProject(projectId);
    } else if (userId) {
      state = await db.getStateByUser(userId);
    }

    if (!state) {
      return json({
        success: true,
        state: null,
        message: 'No active conversation',
      });
    }

    return json({
      success: true,
      state,
    });
  } catch (error) {
    logger.error('[conversation-state] Error getting state:', error);
    return json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}

/**
 * POST /api/conversation-state - Create or update conversation state
 * Body:
 *   - action: 'reset' | 'clear-old' | 'update' | 'add-message' | 'add-edit' | 'add-change'
 *   - data: Action-specific data
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  if (request.method === 'DELETE') {
    // Handle DELETE requests
    return handleDelete(request, context);
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const env = (context as any)?.cloudflare?.env || process.env;
    const db = getDatabase(env);

    if (!db) {
      return json({
        success: false,
        error: 'Database not configured',
      }, { status: 503 });
    }

    // Ensure table exists
    await db.ensureTable();

    const body = await request.json() as {
      action: string;
      data?: any;
    };

    const { action: actionType, data } = body;

    logger.info('[conversation-state] Action:', actionType, data);

    switch (actionType) {
      case 'reset': {
        // Create new conversation state
        const state = await db.createState({
          userId: data?.userId,
          anonymousId: data?.anonymousId,
          projectId: data?.projectId,
          conversationId: data?.conversationId,
        });

        logger.info('[conversation-state] Reset/created conversation state:', state.conversationId);

        return json({
          success: true,
          message: 'Conversation state reset',
          state,
        });
      }

      case 'clear-old': {
        if (!data?.conversationId) {
          // If no conversationId, create a new state
          const state = await db.createState({
            userId: data?.userId,
            anonymousId: data?.anonymousId,
            projectId: data?.projectId,
          });

          logger.info('[conversation-state] Initialized new conversation state for clear-old');

          return json({
            success: true,
            message: 'New conversation state initialized',
            state,
          });
        }

        const state = await db.clearOldData(data.conversationId, {
          keepMessages: data?.keepMessages,
          keepEdits: data?.keepEdits,
          keepMajorChanges: data?.keepMajorChanges,
        });

        if (!state) {
          return json({
            success: false,
            error: 'Conversation not found',
          }, { status: 404 });
        }

        logger.info('[conversation-state] Cleared old conversation data');

        return json({
          success: true,
          message: 'Old conversation data cleared',
          state,
        });
      }

      case 'update': {
        if (!data?.conversationId) {
          return json({
            success: false,
            error: 'conversationId required for update',
          }, { status: 400 });
        }

        const state = await db.updateState(data.conversationId, {
          currentTopic: data.currentTopic,
          userPreferences: data.userPreferences,
        });

        if (!state) {
          return json({
            success: false,
            error: 'No active conversation to update',
          }, { status: 400 });
        }

        return json({
          success: true,
          message: 'Conversation state updated',
          state,
        });
      }

      case 'add-message': {
        if (!data?.conversationId || !data?.message) {
          return json({
            success: false,
            error: 'conversationId and message required',
          }, { status: 400 });
        }

        const message: ConversationMessage = {
          id: data.message.id || `msg-${Date.now()}`,
          role: data.message.role,
          content: data.message.content,
          timestamp: data.message.timestamp || Date.now(),
          metadata: data.message.metadata,
        };

        const state = await db.updateState(data.conversationId, {
          addMessage: message,
        });

        if (!state) {
          return json({
            success: false,
            error: 'Conversation not found',
          }, { status: 404 });
        }

        return json({
          success: true,
          message: 'Message added',
          state,
        });
      }

      case 'add-edit': {
        if (!data?.conversationId || !data?.edit) {
          return json({
            success: false,
            error: 'conversationId and edit required',
          }, { status: 400 });
        }

        const edit: ConversationEdit = {
          timestamp: data.edit.timestamp || Date.now(),
          userRequest: data.edit.userRequest,
          editType: data.edit.editType,
          targetFiles: data.edit.targetFiles || [],
          confidence: data.edit.confidence ?? 1.0,
          outcome: data.edit.outcome || 'success',
          errorMessage: data.edit.errorMessage,
        };

        const state = await db.updateState(data.conversationId, {
          addEdit: edit,
        });

        if (!state) {
          return json({
            success: false,
            error: 'Conversation not found',
          }, { status: 404 });
        }

        return json({
          success: true,
          message: 'Edit recorded',
          state,
        });
      }

      case 'add-change': {
        if (!data?.conversationId || !data?.change) {
          return json({
            success: false,
            error: 'conversationId and change required',
          }, { status: 400 });
        }

        const state = await db.updateState(data.conversationId, {
          addMajorChange: {
            description: data.change.description,
            filesAffected: data.change.filesAffected || [],
          },
        });

        if (!state) {
          return json({
            success: false,
            error: 'Conversation not found',
          }, { status: 404 });
        }

        return json({
          success: true,
          message: 'Major change recorded',
          state,
        });
      }

      default:
        return json({
          success: false,
          error: 'Invalid action. Use "reset", "clear-old", "update", "add-message", "add-edit", or "add-change"',
        }, { status: 400 });
    }
  } catch (error) {
    logger.error('[conversation-state] Error:', error);
    return json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}

/**
 * DELETE handler - Clear conversation state
 */
async function handleDelete(request: Request, context: any) {
  try {
    const env = (context as any)?.cloudflare?.env || process.env;
    const db = getDatabase(env);

    if (!db) {
      return json({
        success: false,
        error: 'Database not configured',
      }, { status: 503 });
    }

    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    const userId = url.searchParams.get('userId');

    if (conversationId) {
      await db.deleteState(conversationId);
      logger.info('[conversation-state] Deleted conversation state:', conversationId);
    } else if (userId) {
      await db.deleteUserStates(userId);
      logger.info('[conversation-state] Deleted all states for user:', userId);
    } else {
      return json({
        success: false,
        error: 'conversationId or userId required',
      }, { status: 400 });
    }

    return json({
      success: true,
      message: 'Conversation state cleared',
    });
  } catch (error) {
    logger.error('[conversation-state] Error clearing state:', error);
    return json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}
